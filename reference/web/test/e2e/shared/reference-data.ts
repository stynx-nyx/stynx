export type ReferenceTenant = {
  id: string;
  slug: string;
  name: string;
};

export type ReferenceActor = {
  email: string;
  permissions: string[];
};

export const referenceTenants = {
  sampleDemo: {
    id: '01978f4a-32bf-7c27-a131-fd73a9e001a1',
    slug: 'sample-demo',
    name: 'Sample Demo Tenant',
  },
  sampleOps: {
    id: '01978f4a-32bf-7c27-a131-fd73a9e001a2',
    slug: 'sample-ops',
    name: 'Sample Ops Tenant',
  },
} satisfies Record<string, ReferenceTenant>;

export const referenceActors = {
  admin: {
    email: 'admin@sample-demo.test',
    permissions: [
      'flow:read:runtime',
      'sample:document:write',
      'sample:record:delete',
      'sample:record:read',
      'sample:record:restore',
      'sample:record:write',
      'sample:work-item:delete',
      'sample:work-item:read',
      'sample:work-item:restore',
      'sample:work-item:write',
    ],
  },
  recordReader: {
    email: 'reader@sample-demo.test',
    permissions: ['sample:record:read'],
  },
} satisfies Record<string, ReferenceActor>;
