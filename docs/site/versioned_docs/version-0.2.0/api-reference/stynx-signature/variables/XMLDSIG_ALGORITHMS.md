[**@stynx/signature**](../index.md)

---

[@stynx/signature](../index.md) / XMLDSIG_ALGORITHMS

# Variable: XMLDSIG_ALGORITHMS

> `const` **XMLDSIG_ALGORITHMS**: `object`

Defined in: [packages/signature/src/xmldsig/c14n.ts:1](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/xmldsig/c14n.ts#L1)

## Type Declaration

### canonicalization

> `readonly` **canonicalization**: `object`

#### canonicalization.exclusive

> `readonly` **exclusive**: `"http://www.w3.org/2001/10/xml-exc-c14n#"` = `'http://www.w3.org/2001/10/xml-exc-c14n#'`

#### canonicalization.exclusiveWithComments

> `readonly` **exclusiveWithComments**: `"http://www.w3.org/2001/10/xml-exc-c14n#WithComments"` = `'http://www.w3.org/2001/10/xml-exc-c14n#WithComments'`

#### canonicalization.inclusive

> `readonly` **inclusive**: `"http://www.w3.org/TR/2001/REC-xml-c14n-20010315"` = `'http://www.w3.org/TR/2001/REC-xml-c14n-20010315'`

#### canonicalization.inclusiveWithComments

> `readonly` **inclusiveWithComments**: `"http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments"` = `'http://www.w3.org/TR/2001/REC-xml-c14n-20010315#WithComments'`

### digest

> `readonly` **digest**: `object`

#### digest.sha1

> `readonly` **sha1**: `"http://www.w3.org/2000/09/xmldsig#sha1"` = `'http://www.w3.org/2000/09/xmldsig#sha1'`

#### digest.sha256

> `readonly` **sha256**: `"http://www.w3.org/2001/04/xmlenc#sha256"` = `'http://www.w3.org/2001/04/xmlenc#sha256'`

#### digest.sha512

> `readonly` **sha512**: `"http://www.w3.org/2001/04/xmlenc#sha512"` = `'http://www.w3.org/2001/04/xmlenc#sha512'`

### signature

> `readonly` **signature**: `object`

#### signature.rsaSha1

> `readonly` **rsaSha1**: `"http://www.w3.org/2000/09/xmldsig#rsa-sha1"` = `'http://www.w3.org/2000/09/xmldsig#rsa-sha1'`

#### signature.rsaSha256

> `readonly` **rsaSha256**: `"http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"` = `'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256'`

#### signature.rsaSha512

> `readonly` **rsaSha512**: `"http://www.w3.org/2001/04/xmldsig-more#rsa-sha512"` = `'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512'`

### transform

> `readonly` **transform**: `object`

#### transform.envelopedSignature

> `readonly` **envelopedSignature**: `"http://www.w3.org/2000/09/xmldsig#enveloped-signature"` = `'http://www.w3.org/2000/09/xmldsig#enveloped-signature'`
