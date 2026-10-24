import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();
const number = z.number();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);

export const importLegacyDelivery = defineQuery({name:'outbox.importLegacyDelivery',text:sql`insert into outbox.event_delivery
             (tenant_id,event_id,legacy_id,status,attempts,next_attempt_at,last_error)
           values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7)`,params:z.tuple([uuid,uuid,uuid,text,number,timestamp.nullable(),text.nullable()]),row:z.object({}),expects:'none'});

export const linkLegacyEvent = defineQuery({name:'outbox.linkLegacyEvent',text:sql`insert into outbox.legacy_event_map (legacy_id,tenant_id,event_id,generation)
           values ($1::uuid,$2::uuid,$3::uuid,$4)`,params:z.tuple([uuid,uuid,uuid,number]),row:z.object({}),expects:'none'});

export const importLegacyAttempt = defineQuery({name:'outbox.importLegacyAttempt',text:sql`insert into outbox.event_attempts
               (tenant_id,event_id,attempt_ordinal,legacy_message_id,result,error,legacy_state)
             values ($1::uuid,$2::uuid,0,$3::uuid,'LEGACY_HISTORY_UNAVAILABLE',$4,$5::jsonb)`,params:z.tuple([uuid,uuid,uuid,text.nullable(),text]),row:z.object({}),expects:'none'});

export const importLegacyAck = defineQuery({name:'outbox.importLegacyAck',text:sql`insert into outbox.event_acks
               (tenant_id,event_id,status,identity_verified,hmac_verified,verification_source,legacy_ack_id,
                legacy_ack_message,legacy_ack_time,received_at)
             values ($1::uuid,$2::uuid,$3,false,false,'legacy-import',$4::uuid,$5,$6,$6)`,params:z.tuple([uuid,uuid,text,uuid,text.nullable(),timestamp]),row:z.object({}),expects:'none'});

export const markLegacyMigrated = defineQuery({name:'outbox.markLegacyMigrated',text:sql`update outbox.messages set migrated_event_id=$2::uuid,cutover_generation=$3 where id=$1::uuid`,params:z.tuple([uuid,uuid,number]),row:z.object({}),expects:'none'});

export const finishLegacyOwnership = defineQuery({name:'outbox.finishLegacyOwnership',text:sql`update outbox.legacy_ownership set state='NEW',generation=$1 where id=true`,params:z.tuple([number]),row:z.object({}),expects:'none'});

export const quarantineUnboundAck = defineQuery({name:'outbox.quarantineUnboundAck',text:sql`insert into outbox.ack_quarantine (raw_body,raw_sha256,reason) values ($1,$2,$3)`,params:z.tuple([z.instanceof(Buffer),text,text]),row:z.object({}),expects:'none'});

export const applyTenantAck = defineQuery({name:'outbox.applyTenantAck',text:sql`update outbox.event_delivery set status=$3,next_attempt_at=$4,lease_until=null,updated_at=clock_timestamp()
          where tenant_id=$1::uuid and event_id=$2::uuid and status not in ('ACKED','RETIRED')`,params:z.tuple([uuid,uuid,text,timestamp.nullable()]),row:z.object({}),expects:'none'});

export const recordTenantAck = defineQuery({name:'outbox.recordTenantAck',text:sql`insert into outbox.event_acks (tenant_id,event_id,status,raw_body,raw_sha256,identity_verified,hmac_verified,verification_source)
         values ($1::uuid,$2::uuid,$3,$4,$5,true,true,'verified-raw-body')`,params:z.tuple([uuid,uuid,text,z.instanceof(Buffer),text]),row:z.object({}),expects:'none'});

export const extendTenantLease = defineQuery({name:'outbox.extendTenantLease',text:sql`update outbox.event_delivery set lease_until=clock_timestamp()+($4::integer * interval '1 millisecond'),updated_at=clock_timestamp()
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempts=$3 and status='SENT'`,params:z.tuple([uuid,uuid,number,number]),row:z.object({}),expects:'none'});

export const persistTenantSent = defineQuery({name:'outbox.persistTenantSent',text:sql`update outbox.event_attempts set result='SENT',completed_at=clock_timestamp(),
                   provider=$4,protocol=$5,request_bytes=$6,request_sha256=$7,
                   response_bytes=$8,response_sha256=$9,request_headers=$10::jsonb,
                   response_status=$11,evidence_state=$12::jsonb
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,params:z.tuple([uuid,uuid,number,text.nullable(),text.nullable(),z.instanceof(Buffer).nullable(),text.nullable(),z.instanceof(Buffer).nullable(),text.nullable(),text.nullable(),number.nullable(),text]),row:z.object({}),expects:'none'});


export const readLegacyCutoverRows=defineQuery({name:'outbox.readLegacyCutoverRows',text:sql`select id,tenant_id,entity,entity_id,payload,metadata,idempotency_key,status,attempts,next_attempt_at,last_error,created_at,updated_at
            from outbox.messages order by tenant_id,created_at,id for update`,params:z.tuple([]),row:z.object({ id:uuid,tenant_id:uuid,entity:text,entity_id:text,payload:z.json(),metadata:z.json(),idempotency_key:text,status:text,attempts:number,next_attempt_at:timestamp.nullable(),last_error:text.nullable(),created_at:timestamp,updated_at:timestamp }),expects:'many'});

export const advanceCutoverClock=defineQuery({name:'outbox.advanceCutoverClock',text:sql`insert into outbox.tenant_clock (tenant_id,last_ms)
             values ($1::uuid,greatest(0,floor(extract(epoch from clock_timestamp())*1000)::bigint))
           on conflict (tenant_id) do update set last_ms=greatest(outbox.tenant_clock.last_ms,excluded.last_ms)
           returning last_ms::text`,params:z.tuple([uuid]),row:z.object({last_ms:text}),expects:'many'});

export const createCutoverEvent=defineQuery({name:'outbox.createCutoverEvent',text:sql`insert into outbox.events (id,tenant_id,entity,entity_id,idempotency_key,payload,metadata,created_at)
           values (outbox.event_uuid($1::bigint,nextval('outbox.event_order_seq')),$2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb,to_timestamp($1::double precision/1000))
           returning id`,params:z.tuple([text,uuid,text,text,text,text,text.nullable()]),row:z.object({id:uuid}),expects:'many'});

export const readLegacyAck=defineQuery({name:'outbox.readLegacyAck',text:sql`select id,ack_status,ack_message,ack_time from outbox.acknowledgements where message_id=$1::uuid`,params:z.tuple([uuid]),row:z.object({id:uuid,ack_status:text,ack_message:text.nullable(),ack_time:timestamp}),expects:'many'});

export const enqueueEventDelivery=defineQuery({name:'outbox.enqueueEventDelivery',text:sql`insert into outbox.event_delivery (tenant_id,event_id) values ($1::uuid,$2::uuid)`,params:z.tuple([uuid,uuid]),row:z.object({}),expects:'none'});

export const recordClaimedAttempt=defineQuery({name:'outbox.recordClaimedAttempt',text:sql`insert into outbox.event_attempts (tenant_id,event_id,attempt_ordinal,result,leased_at)
           values ($1::uuid,$2::uuid,$3,'CLAIMED',clock_timestamp())
           on conflict (tenant_id,event_id,attempt_ordinal) do nothing`,params:z.tuple([uuid,uuid,number]),row:z.object({}),expects:'none'});

export const markDeliveryFailed=defineQuery({name:'outbox.markDeliveryFailed',text:sql`update outbox.event_delivery set status='ERROR',lease_until=null,
                   next_attempt_at=$3,last_error=$4,updated_at=clock_timestamp()
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempts=$5 and status='SENT'
                 returning event_id`,params:z.tuple([uuid,uuid,timestamp.nullable(),text,number]),row:z.object({event_id:uuid}),expects:'many'});

export const persistFailedAttempt=defineQuery({name:'outbox.persistFailedAttempt',text:sql`update outbox.event_attempts set result='ERROR',error=$4,completed_at=clock_timestamp(),
                   provider=$5,protocol=$6,request_bytes=$7,request_sha256=$8,
                   response_bytes=$9,response_sha256=$10,request_headers=$11::jsonb,
                   response_status=$12,evidence_state=$13::jsonb
                 where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,params:z.tuple([uuid,uuid,number,text,text.nullable(),text.nullable(),z.instanceof(Buffer).nullable(),text.nullable(),z.instanceof(Buffer).nullable(),text.nullable(),text.nullable(),number.nullable(),text]),row:z.object({}),expects:'none'});

export const markEventRetired=defineQuery({name:'outbox.markEventRetired',text:sql`update outbox.event_delivery
           set status='RETIRED',lease_until=null,next_attempt_at=null,updated_at=clock_timestamp()
           where tenant_id=$1::uuid and event_id=$2::uuid`,params:z.tuple([uuid,uuid]),row:z.object({}),expects:'none'});

export const recordOwnerClaimedAttempt=defineQuery({name:'outbox.recordOwnerClaimedAttempt',text:sql`insert into outbox.event_attempts
             (tenant_id,event_id,attempt_ordinal,result,leased_at)
           values ($1::uuid,$2::uuid,$3,'CLAIMED',clock_timestamp())
           on conflict (tenant_id,event_id,attempt_ordinal) do nothing`,params:z.tuple([uuid,uuid,number]),row:z.object({}),expects:'none'});

export const extendOwnerLease=defineQuery({name:'outbox.extendOwnerLease',text:sql`update outbox.event_delivery
                  set lease_until=clock_timestamp()+($4::integer * interval '1 millisecond'),
                      updated_at=clock_timestamp()
                where tenant_id=$1::uuid and event_id=$2::uuid and attempts=$3 and status='SENT'`,params:z.tuple([uuid,uuid,number,number]),row:z.object({}),expects:'none'});

export const persistOwnerSent=defineQuery({name:'outbox.persistOwnerSent',text:sql`update outbox.event_attempts set result='SENT',completed_at=clock_timestamp(),
                   provider=$4,protocol=$5,request_bytes=$6,request_sha256=$7,
                   response_bytes=$8,response_sha256=$9,
                   request_headers=$10::jsonb,response_status=$11,evidence_state=$12::jsonb
                where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,params:z.tuple([uuid,uuid,number,text.nullable(),text.nullable(),z.instanceof(Buffer).nullable(),text.nullable(),z.instanceof(Buffer).nullable(),text.nullable(),text.nullable(),number.nullable(),text]),row:z.object({}),expects:'none'});

export const markOwnerDeliveryFailed=defineQuery({name:'outbox.markOwnerDeliveryFailed',text:sql`update outbox.event_delivery set status='ERROR',lease_until=null,
                   next_attempt_at=$3,last_error=$4,updated_at=clock_timestamp()
                 where tenant_id=$1::uuid and event_id=$2::uuid
                   and attempts=$5 and status='SENT'
                 returning event_id`,params:z.tuple([uuid,uuid,timestamp.nullable(),text,number]),row:z.object({event_id:uuid}),expects:'many'});

export const persistOwnerFailedAttempt=defineQuery({name:'outbox.persistOwnerFailedAttempt',text:sql`update outbox.event_attempts set result='ERROR',error=$4,completed_at=clock_timestamp(),
                  provider=$5,protocol=$6,request_bytes=$7,request_sha256=$8,
                  response_bytes=$9,response_sha256=$10,
                  request_headers=$11::jsonb,response_status=$12,evidence_state=$13::jsonb
                where tenant_id=$1::uuid and event_id=$2::uuid and attempt_ordinal=$3`,params:z.tuple([uuid,uuid,number,text,text.nullable(),text.nullable(),z.instanceof(Buffer).nullable(),text.nullable(),z.instanceof(Buffer).nullable(),text.nullable(),text.nullable(),number.nullable(),text]),row:z.object({}),expects:'none'});

export const recordLegacyFailedAttempt=defineQuery({name:'outbox.recordLegacyFailedAttempt',text:sql`insert into outbox.event_attempts
                   (tenant_id,event_id,attempt_ordinal,legacy_message_id,result,error,completed_at)
                 values ($1::uuid,$2::uuid,$3,$4::uuid,'ERROR',$5,clock_timestamp())
                 on conflict (tenant_id,event_id,attempt_ordinal) do nothing`,params:z.tuple([uuid,uuid,number,uuid,text]),row:z.object({}),expects:'none'});

export const markLegacyDeliveryFailed=defineQuery({name:'outbox.markLegacyDeliveryFailed',text:sql`update outbox.event_delivery set status='ERROR',next_attempt_at=$3,
                   last_error=$4,updated_at=clock_timestamp()
                 where tenant_id=$1::uuid and event_id=$2::uuid
                   and status='SENT_UNRESOLVED'`,params:z.tuple([uuid,uuid,timestamp.nullable(),text]),row:z.object({}),expects:'none'});

export const recordLegacyAssertedAck=defineQuery({name:'outbox.recordLegacyAssertedAck',text:sql`insert into outbox.event_acks
                 (tenant_id,event_id,status,identity_verified,hmac_verified,verification_source)
               values ($1::uuid,$2::uuid,$3,false,false,'caller-asserted-legacy-api')`,params:z.tuple([uuid,uuid,text]),row:z.object({}),expects:'none'});

export const applyLegacyAck=defineQuery({name:'outbox.applyLegacyAck',text:sql`update outbox.event_delivery set status=$3,next_attempt_at=$4,lease_until=null,
                 updated_at=clock_timestamp()
               where tenant_id=$1::uuid and event_id=$2::uuid and status not in ('ACKED','RETIRED')`,params:z.tuple([uuid,uuid,text,timestamp.nullable()]),row:z.object({}),expects:'none'});

const deliveryStatus=z.enum(['PENDING','SENT','SENT_UNRESOLVED','ERROR','ACKED','RETIRED']);

export const lookupAckEvent=defineQuery({name:'outbox.lookupAckEvent',text:sql`select id from outbox.events where tenant_id=$1::uuid
           and ($2::uuid is null or id=$2::uuid)
           and ($3::text is null or idempotency_key=$3) limit 1`,params:z.tuple([uuid,uuid.nullable(),text.nullable()]),row:z.object({id:uuid}),expects:'many'});

export const lockAckDelivery=defineQuery({name:'outbox.lockAckDelivery',text:sql`select attempts from outbox.event_delivery
          where tenant_id=$1::uuid and event_id=$2::uuid for update`,params:z.tuple([uuid,uuid]),row:z.object({attempts:number}),expects:'many'});

export const lockRetryDelivery=defineQuery({name:'outbox.lockRetryDelivery',text:sql`select status,attempts from outbox.event_delivery
          where tenant_id=$1::uuid and event_id=$2::uuid for update`,params:z.tuple([uuid,uuid]),row:z.object({status:deliveryStatus,attempts:number}),expects:'many'});

export const retryDelivery=defineQuery({name:'outbox.retryDelivery',text:sql`update outbox.event_delivery
            set status='PENDING',next_attempt_at=case when $3::timestamptz is null then clock_timestamp()
                  else least(coalesce(next_attempt_at,clock_timestamp()),$3::timestamptz) end,
                lease_until=null,updated_at=clock_timestamp()
          where tenant_id=$1::uuid and event_id=$2::uuid and status='ERROR' returning event_id`,params:z.tuple([uuid,uuid,timestamp.nullable()]),row:z.object({event_id:uuid}),expects:'many'});

export const lockRetirementDelivery=defineQuery({name:'outbox.lockRetirementDelivery',text:sql`select status,lease_until as "leaseUntil",
            nullif(current_setting('app.actor_id',true),'')::uuid as "actorId"
          from outbox.event_delivery
          where tenant_id=$1::uuid and event_id=$2::uuid for update`,params:z.tuple([uuid,uuid]),row:z.object({status:deliveryStatus,leaseUntil:timestamp.nullable(),actorId:uuid.nullable()}),expects:'many'});

export const checkRetirementLease=defineQuery({name:'outbox.checkRetirementLease',text:sql`select $1::timestamptz>clock_timestamp() as active`,params:z.tuple([timestamp]),row:z.object({active:z.boolean()}),expects:'many'});

export const readLegacyEventLink=defineQuery({name:'outbox.readLegacyEventLink',text:sql`select tenant_id,migrated_event_id from outbox.messages where id=$1::uuid`,params:z.tuple([uuid]),row:z.object({tenant_id:uuid,migrated_event_id:uuid.nullable()}),expects:'many'});
