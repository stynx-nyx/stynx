#!/usr/bin/env python3
"""Offline TEST PKI and minimal-LTA candidate. Python stdlib + OpenSSL 3 only.

Originally an Engineer preparation builder; reused here to create fresh Inspector
TEST keys and public fixtures. Running it is not an acceptance verdict. Keys here are newly generated, test-only, and have no production trust.
Regeneration is procedural: random keys and issuance times change the bytes.
"""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from datetime import datetime, timezone


def digest(data):
    return hashlib.sha256(data).hexdigest()


def der(tag, body):
    n = len(body)
    length = bytes([n]) if n < 128 else bytes([128 + (n.bit_length() + 7)//8]) + n.to_bytes((n.bit_length()+7)//8, 'big')
    return bytes([tag]) + length + body


def parts(data):
    result = []
    at = 0
    while at < len(data):
        begin = at
        tag, n = data[at:at+2]
        at += 2
        if n & 128:
            count = n & 127
            if count == 0:
                raise ValueError('Indefinite DER length')
            n = int.from_bytes(data[at:at+count], 'big')
            at += count
        end = at + n
        if end > len(data):
            raise ValueError('Truncated DER')
        result.append((tag, data[at:end], data[begin:end]))
        at = end
    return result


def cms_fields(cms):
    outer = parts(parts(cms)[0][1])
    signed = parts(parts(outer[1][1])[0][1])
    info = parts(parts(signed[-1][1])[0][1])
    return outer, signed, info


def signature_value(cms):
    return next(body for tag, body, _ in cms_fields(cms)[2] if tag == 4)


def with_signature_timestamp(cms, token):
    outer, signed, info = cms_fields(cms)
    # id-aa-signatureTimeStampToken, RFC 3161 token as attribute value.
    oid = bytes.fromhex('060b2a864886f70d010910020e')
    attr = der(0x30, oid + der(0x31, token))
    signer = der(0x30, b''.join(x[2] for x in info) + der(0xa1, attr))
    body = b''.join(x[2] for x in signed[:-1]) + der(0x31, signer)
    return der(0x30, outer[0][2] + der(0xa0, der(0x30, body)))


def append_revision(pdf, objects):
    markers = re.findall(rb'startxref\s+(\d+)\s+%%EOF', pdf)
    previous = int(markers[-1]) if markers else None
    offsets = {}
    for number, body in objects:
        offsets[number] = len(pdf)
        pdf += f'{number} 0 obj\n'.encode() + body + b'\nendobj\n'
    at = len(pdf)
    pdf += b'xref\n'
    for number in sorted(offsets):
        pdf += f'{number} 1\n{offsets[number]:010d} 00000 n \n'.encode()
    sizes = [int(x) for x in re.findall(rb'/Size\s+(\d+)', pdf)]
    size = max([max(offsets)+1, *sizes])
    trailer = f'<< /Size {size} /Root 1 0 R' + (f' /Prev {previous}' if previous is not None else '') + ' >>'
    return pdf + f'trailer\n{trailer}\nstartxref\n{at}\n%%EOF\n'.encode()


def stream(data):
    return f'<< /Length {len(data)} >>\nstream\n'.encode() + data + b'\nendstream'


def prepared_signature(prefix, objects_before, number, kind, subfilter):
    marker = b'/ByteRange [0000000000 0000000000 0000000000 0000000000]'
    dictionary = f'<< /Type /{kind} /Filter /Adobe.PPKLite /SubFilter /{subfilter} '.encode()
    dictionary += marker + b' /Contents <' + b'0'*40000 + b'> >>'
    pdf = append_revision(prefix, objects_before + [(number, dictionary)])
    a = pdf.index(b'/Contents <', len(prefix)) + len(b'/Contents ')
    b = a + 40002
    new = f'/ByteRange [{0:010d} {a:010d} {b:010d} {len(pdf)-b:010d}]'.encode()
    assert len(marker) == len(new)
    pdf = pdf[:len(prefix)] + pdf[len(prefix):].replace(marker, new, 1)
    return pdf, a, b


def insert_token(pdf, a, b, token):
    encoded = token.hex().encode()
    assert len(encoded) <= b-a-2
    return pdf[:a+1] + encoded + b'0'*(b-a-2-len(encoded)) + pdf[b-1:]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=False)
    commands = []

    def run(*args, expected=0):
        command = ['openssl', *map(str, args)]
        result = subprocess.run(command, cwd=out, capture_output=True, text=True)
        commands.append({'argv':command, 'returncode':result.returncode, 'stdout':result.stdout, 'stderr':result.stderr})
        if result.returncode != expected:
            raise RuntimeError(f'{command}: {result.stderr}')
        return result.stdout

    def write(name, data):
        (out/name).write_bytes(data if isinstance(data, bytes) else data.encode())

    def pem_der(name):
        return base64.b64decode(''.join(x for x in (out/name).read_text().splitlines() if not x.startswith('---')))

    def issue(root, leaf, serial, tsa=False):
        run('genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',f'{root}.key.pem')
        run('req','-x509','-new','-key',f'{root}.key.pem','-days','3650','-sha256','-subj',f'/CN=DETRAN TEST ONLY {root}',
            '-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign',
            '-addext','subjectKeyIdentifier=hash','-out',f'{root}.cert.pem')
        run('genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:2048','-out',f'{leaf}.key.pem')
        run('req','-new','-key',f'{leaf}.key.pem','-subj',f'/CN=DETRAN TEST ONLY {leaf}','-out',f'{leaf}.csr.pem')
        ext = 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n'
        ext += 'extendedKeyUsage=critical,timeStamping\n' if tsa else 'extendedKeyUsage=emailProtection\n'
        write(f'{leaf}.ext',ext)
        run('x509','-req','-in',f'{leaf}.csr.pem','-CA',f'{root}.cert.pem','-CAkey',f'{root}.key.pem',
            '-set_serial',str(serial),'-days','30','-sha256','-extfile',f'{leaf}.ext','-out',f'{leaf}.cert.pem')
        run('x509','-in',f'{leaf}.cert.pem','-outform','DER','-out',f'{leaf}.cert.der')
        write(f'{leaf}-chain.pem',(out/f'{leaf}.cert.pem').read_bytes()+(out/f'{root}.cert.pem').read_bytes())
        expiry = run('x509','-in',f'{leaf}.cert.pem','-enddate','-noout').strip().split('=',1)[1]
        expiry = datetime.strptime(expiry,'%b %d %H:%M:%S %Y %Z').strftime('%y%m%d%H%M%SZ')
        write(f'{root}.index',f'V\t{expiry}\t\t{serial:04X}\tunknown\t/CN=DETRAN TEST ONLY {leaf}\n')
        run('ocsp','-issuer',f'{root}.cert.pem','-cert',f'{leaf}.cert.pem','-reqout',f'{leaf}.ocsp-request.der','-no_nonce')
        run('ocsp','-index',f'{root}.index','-rsigner',f'{root}.cert.pem','-rkey',f'{root}.key.pem',
            '-CA',f'{root}.cert.pem','-reqin',f'{leaf}.ocsp-request.der','-respout',f'{leaf}.ocsp.der','-ndays','7')
        write(f'{root}.serial','1000\n');write(f'{root}.crlnumber','01\n')
        write(f'{root}.ca.cnf',f'[ca]\ndefault_ca=default\n[default]\ndatabase={root}.index\nserial={root}.serial\ncrlnumber={root}.crlnumber\ncertificate={root}.cert.pem\nprivate_key={root}.key.pem\ndefault_md=sha256\ndefault_crl_days=7\npolicy=policy\n[policy]\ncommonName=supplied\n')
        run('ca','-config',f'{root}.ca.cnf','-gencrl','-out',f'{root}.crl.pem','-batch')
        run('crl','-in',f'{root}.crl.pem','-outform','DER','-out',f'{root}.crl.der')
        return expiry

    issue('signer-root','signer',1001)
    issue('signature-tsa-root','signature-tsa',1002,True)
    archive_expiry = issue('archive-tsa-root','archive-tsa',1003,True)

    def timestamp(name, data, leaf, root):
        write(f'{name}.data',data)
        run('ts','-query','-data',f'{name}.data','-sha256','-cert','-out',f'{name}.tsq')
        write(f'{name}.serial','01\n')
        # 1.2.3.4.5.6.7 is explicitly a local fixture identifier, not an approved production OID.
        write(f'{name}.cnf',f'[tsa]\ndefault_tsa=default\n[default]\nserial={name}.serial\nsigner_cert={leaf}.cert.pem\nsigner_key={leaf}.key.pem\ncerts={root}.cert.pem\ndefault_policy=1.2.3.4.5.6.7\ncrypto_device=builtin\nsigner_digest=sha256\ndigests=sha256\naccuracy=secs:1\nordering=yes\ntsa_name=yes\ness_cert_id_chain=no\n')
        run('ts','-reply','-config',f'{name}.cnf','-queryfile',f'{name}.tsq','-out',f'{name}.tsr')
        run('ts','-reply','-in',f'{name}.tsr','-token_out','-out',f'{name}.token.der')
        run('ts','-verify','-data',f'{name}.data','-in',f'{name}.token.der','-token_in','-CAfile',f'{root}.cert.pem','-untrusted',f'{leaf}.cert.pem')
        return (out/f'{name}.token.der').read_bytes()

    content=b'BT /F1 12 Tf 40 740 Td (DETRAN TEST ONLY - NO PATIENT DATA) Tj ET\n'
    source=append_revision(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n',[
        (1,b'<< /Type /Catalog /Pages 2 0 R >>'),(2,b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
        (3,b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 90 0 R >> >> /Contents 4 0 R >>'),
        (4,stream(content)),(90,b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')])
    write('source.pdf',source)
    signed,a,b=prepared_signature(source,[
        (1,b'<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R >>'),
        (5,b'<< /Fields [6 0 R] /SigFlags 3 >>'),
        (6,b'<< /Type /Annot /Subtype /Widget /FT /Sig /T (TestSignature) /Rect [0 0 0 0] /P 3 0 R /V 7 0 R >>')],7,'Sig','ETSI.CAdES.detached')
    write('signed-coverage.bin',signed[:a]+signed[b:])
    run('cms','-sign','-binary','-cades','-md','sha256','-in','signed-coverage.bin','-signer','signer.cert.pem',
        '-inkey','signer.key.pem','-certfile','signer-root.cert.pem','-outform','DER','-out','base.cms.der')
    base=(out/'base.cms.der').read_bytes()
    token=timestamp('signature-timestamp',signature_value(base),'signature-tsa','signature-tsa-root')
    cms=with_signature_timestamp(base,token)
    write('signature.cms.der',cms)
    run('cms','-verify','-binary','-cades','-inform','DER','-in','signature.cms.der',
        '-content','signed-coverage.bin','-CAfile','signer-root.cert.pem','-out','verified-content.bin')
    signed=insert_token(signed,a,b,cms)
    write('signed-revision.pdf',signed)
    certs=['signer.cert.der','signature-tsa.cert.der','archive-tsa.cert.der']
    certs += [f'{r}.cert.pem' for r in ['signer-root','signature-tsa-root','archive-tsa-root']]
    objects=[]; refs=[]
    for i,name in enumerate(certs,10):
        objects.append((i,stream(pem_der(name) if name.endswith('.pem') else (out/name).read_bytes())));refs.append(f'{i} 0 R')
    ocsp_refs=[];crl_refs=[]
    for i,leaf in enumerate(['signer','signature-tsa','archive-tsa'],20):
        objects.append((i,stream((out/f'{leaf}.ocsp.der').read_bytes())));ocsp_refs.append(f'{i} 0 R')
    for i,root in enumerate(['signer-root','signature-tsa-root','archive-tsa-root'],30):
        objects.append((i,stream((out/f'{root}.crl.der').read_bytes())));crl_refs.append(f'{i} 0 R')
    dss=f'<< /Type /DSS /Certs [{" ".join(refs)}] /OCSPs [{" ".join(ocsp_refs)}] /CRLs [{" ".join(crl_refs)}] >>'.encode()
    catalog=b'<< /Type /Catalog /Pages 2 0 R /AcroForm 5 0 R /DSS 8 0 R >>'
    blt=append_revision(signed,[(1,catalog),(8,dss),*objects]);write('blt-only.pdf',blt)

    def archive(prefix,name,number=40,fields=b'6 0 R'):
        # Add only an invisible timestamp signature field and its value; no page/content/metadata update.
        stamped,c,d=prepared_signature(prefix,[(5,b'<< /Fields ['+fields+f' {number+1} 0 R] /SigFlags 3 >>'.encode()),
            (number+1,f'<< /Type /Annot /Subtype /Widget /FT /Sig /T ({name}) /Rect [0 0 0 0] /P 3 0 R /V {number} 0 R >>'.encode())],number,'DocTimeStamp','ETSI.RFC3161')
        tok=timestamp(name,stamped[:c]+stamped[d:],'archive-tsa','archive-tsa-root')
        result=insert_token(stamped,c,d,tok);write(f'{name}.pdf',result)
        return result,c,d

    positive,c,d=archive(blt,'minimal-lta')
    bad=bytearray(positive);bad[c+1]=ord('1') if bad[c+1]!=ord('1') else ord('2');write('negative-tampered-archive-token.pdf',bytes(bad))
    bad=bytearray(positive);at=positive.index(b'NO PATIENT DATA');bad[at]=ord('X');write('negative-tampered-content.pdf',bytes(bad))
    write('negative-trailing-bytes.pdf',positive+b'UNAUTHENTICATED TRAILING BYTES\n')
    metadata=append_revision(positive,[(99,b'<< /Title (TEST forbidden later metadata) >>')])
    # Make a syntactically valid metadata revision by adding Info to its own trailer.
    metadata=metadata[:metadata.rfind(b'trailer\n')]+metadata[metadata.rfind(b'trailer\n'):].replace(b'/Root 1 0 R',b'/Root 1 0 R /Info 99 0 R',1)
    write('negative-later-metadata.pdf',metadata)
    extra_dss=append_revision(blt,[(8,dss)])
    archive(extra_dss,'negative-second-dss')
    archive(positive,'negative-renewed-timestamp',50,b'6 0 R 41 0 R')
    # Public alternate evidence: the archive leaf is revoked under its real TEST issuer.
    revoked=datetime.now(timezone.utc).strftime('%y%m%d%H%M%SZ')
    original_index=(out/'archive-tsa-root.index').read_bytes()
    write('archive-tsa-root.index',f'R\t{archive_expiry}\t{revoked}\t03EB\tunknown\t/CN=DETRAN TEST ONLY archive-tsa\n')
    run('ca','-config','archive-tsa-root.ca.cnf','-gencrl','-out','archive-revoked.crl.pem','-batch')
    run('crl','-in','archive-revoked.crl.pem','-outform','DER','-out','archive-revoked.crl.der')
    write('archive-tsa-root.index',original_index)
    checks=[]
    for root,leaf in [('signer-root','signer'),('signature-tsa-root','signature-tsa'),('archive-tsa-root','archive-tsa')]:
        run('verify','-CAfile',f'{root}.cert.pem',f'{leaf}.cert.pem')
        run('ocsp','-respin',f'{leaf}.ocsp.der','-issuer',f'{root}.cert.pem','-cert',f'{leaf}.cert.pem',
            '-CAfile',f'{root}.cert.pem','-no_nonce')
        run('verify','-crl_check','-CAfile',f'{root}.cert.pem','-CRLfile',f'{root}.crl.pem',f'{leaf}.cert.pem')
        checks.append({'leaf':leaf,'certificate':json.loads(json.dumps(run('x509','-in',f'{leaf}.cert.pem','-noout','-subject','-issuer','-serial','-dates','-fingerprint','-sha256'))),'rootDerSha256':digest(pem_der(f'{root}.cert.pem'))})
    run('verify','-crl_check','-CAfile','archive-tsa-root.cert.pem','-CRLfile','archive-revoked.crl.pem','archive-tsa.cert.pem',expected=2)
    run('verify','-CAfile','signature-tsa-root.cert.pem','archive-tsa.cert.pem',expected=2)
    # Actual negative crypto verification, not just mutation creation.
    bad=bytearray((out/'minimal-lta.data').read_bytes());bad[0]^=1;write('negative-imprint.data',bytes(bad))
    run('ts','-verify','-data','negative-imprint.data','-in','minimal-lta.token.der','-token_in',
        '-CAfile','archive-tsa-root.cert.pem','-untrusted','archive-tsa.cert.pem',expected=1)
    version = run('version').strip()
    write('commands.json',json.dumps(commands,indent=2)+'\n')
    manifests=[]
    for p in sorted(out.iterdir()):
        if p.is_file():
            manifests.append({'path':p.name,'bytes':p.stat().st_size,'sha256':digest(p.read_bytes()),
                'classification':'TEST_ONLY_PRIVATE_KEY' if '.key.' in p.name else 'TEST_ONLY_PUBLIC_OR_BUILD_INPUT'})
            if '.key.' in p.name:os.chmod(p,0o600)
    manifest={'classification':'SYNTHETIC TEST ONLY; NO DETRAN PROVIDER OR PRODUCTION POLICY CLAIM',
        'generatedAt':datetime.now(timezone.utc).isoformat(),'generatorSha256':digest(Path(__file__).read_bytes()),
        'openssl':version,'python':os.sys.version,'files':manifests,'certificates':checks,
        'positiveCandidate':{'path':'minimal-lta.pdf','sha256':digest(positive),'revisions':['source','signer','DSS','DocTimeStamp'],
            'signedRevisionBytes':len(signed),'dssRevisionBytes':len(blt),'finalBytes':len(positive),
            'archiveByteRange':[0,c,d,len(positive)-d],'archiveCoversToEnd':d+len(positive)-d==len(positive)},
        'negativeWitnesses':{'blt-only.pdf':'no archive timestamp','negative-tampered-archive-token.pdf':'invalid timestamp DER/signature',
            'negative-tampered-content.pdf':'invalid signer and archive imprint','negative-trailing-bytes.pdf':'archive coverage does not reach EOF',
            'negative-later-metadata.pdf':'later valid incremental metadata revision','negative-second-dss.pdf':'two DSS revisions, archive cryptography valid',
            'negative-renewed-timestamp.pdf':'two document timestamps, cryptography valid',
            'archive-revoked.crl.der':'archive leaf revoked under real TEST issuer',
            'signature-tsa-root.cert.pem':'wrong archive anchor produces OpenSSL path rejection'},
        'establishes':['real TEST RSA/CMS signatures','RFC3161 imprints/token signatures and critical timestamp EKU',
            'three distinct test root/leaf chains','embedded OCSP/CRL bytes before archive timestamp','signed PDF ranges and two-revision candidate structure',
            'OpenSSL rejects wrong imprint, wrong archive root, revoked archive leaf'],
        'doesNotEstablish':['STYNX acceptance or its allow-list correctness','independent security review','general ETSI certification',
            'actual provider compatibility','approved per-UF/document-kind trust values','production readiness'],
        'reproduce':'python3 build.py --out <new-empty-output-directory>; byte-identical replay uses manifest-pinned outputs, generation uses new randomness/time',
        'expiry':'Leaf certificates last 30 days; OCSP/CRL 7 days. Recheck at verification time or regenerate; never trust this PKI outside tests.'}
    write('manifest.json',json.dumps(manifest,indent=2)+'\n')
    print(json.dumps(manifest['positiveCandidate'],indent=2))


if __name__=='__main__':main()
