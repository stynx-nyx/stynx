import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../..', import.meta.url));
const helper = fileURLToPath(new URL('./support/audit-native-probe.mjs', import.meta.url));
const child = spawnSync(process.execPath, ['--experimental-vm-modules', helper, root], { encoding: 'utf8', timeout: 30000 });
assert.equal(child.error, undefined);
assert.equal(child.status, 0, child.stderr || child.stdout);
const actual = JSON.parse(child.stdout);
assert.deepEqual(actual.actualEffects, []);
const expected = [
  {
    "name": "workspace unknown severity skips malformed findings",
    "value": {
      "blocking": [],
      "accepted": []
    }
  },
  {
    "name": "workspace scalar string paths remain flatMap success",
    "value": {
      "blocking": [],
      "accepted": [
        "GHSA-vfj7-8cjw-p6xm braces (high)"
      ]
    }
  },
  {
    "name": "workspace numeric path retains native split refusal",
    "error": {
      "name": "TypeError",
      "message": "path.split is not a function"
    }
  },
  {
    "name": "workspace string findings retain native flatMap refusal",
    "error": {
      "name": "TypeError",
      "message": "(advisory.findings ?? []).flatMap is not a function"
    }
  },
  {
    "name": "cdk unknown severity skips malformed nodes",
    "value": {
      "blocking": [],
      "accepted": []
    }
  },
  {
    "name": "cdk version admission precedes malformed nodes",
    "value": {
      "blocking": [
        "brace-expansion"
      ],
      "accepted": []
    }
  },
  {
    "name": "cdk string nodes retain native every refusal",
    "error": {
      "name": "TypeError",
      "message": "finding.nodes.every is not a function"
    }
  },
  {
    "name": "cdk null via retains native url read refusal",
    "error": {
      "name": "TypeError",
      "message": "Cannot read properties of null (reading 'url')"
    }
  },
  {
    "name": "workspace CLI recover",
    "trace": [
      [
        "spawn",
        "pnpm",
        [
          "audit",
          "--json"
        ],
        {
          "cwd": "/synthetic/stynx",
          "encoding": "utf8",
          "maxBuffer": 67108864
        }
      ],
      "error.stdout:1",
      "error.stdout:2",
      "error.stdout:3"
    ],
    "stdout": [
      "[workspace-audit][ok] no unaccepted findings at or above info\n"
    ],
    "stderr": [],
    "error": null
  },
  {
    "name": "workspace CLI empty",
    "trace": [
      [
        "spawn",
        "pnpm",
        [
          "audit",
          "--json"
        ],
        {
          "cwd": "/synthetic/stynx",
          "encoding": "utf8",
          "maxBuffer": 67108864
        }
      ],
      "error.stdout:1",
      "error.stdout:2"
    ],
    "stdout": [],
    "stderr": [],
    "error": {
      "name": "Error",
      "message": "audit child sentinel",
      "sameSentinel": true
    }
  },
  {
    "name": "workspace CLI nonstring",
    "trace": [
      [
        "spawn",
        "pnpm",
        [
          "audit",
          "--json"
        ],
        {
          "cwd": "/synthetic/stynx",
          "encoding": "utf8",
          "maxBuffer": 67108864
        }
      ],
      "error.stdout:1"
    ],
    "stdout": [],
    "stderr": [],
    "error": {
      "name": "Error",
      "message": "audit child sentinel",
      "sameSentinel": true
    }
  },
  {
    "name": "cdk CLI recover",
    "trace": [
      [
        "spawn",
        "npm",
        [
          "audit",
          "--json"
        ],
        {
          "cwd": "/synthetic/stynx/infra/cdk",
          "encoding": "utf8"
        }
      ],
      "error.stdout:1",
      "error.stdout:2",
      "error.stdout:3",
      [
        "read",
        "/synthetic/stynx/infra/cdk/node_modules/aws-cdk-lib/package.json",
        "utf8"
      ]
    ],
    "stdout": [
      "[cdk-audit][ok] no unaccepted high or critical findings\n"
    ],
    "stderr": [],
    "error": null
  },
  {
    "name": "cdk CLI empty",
    "trace": [
      [
        "spawn",
        "npm",
        [
          "audit",
          "--json"
        ],
        {
          "cwd": "/synthetic/stynx/infra/cdk",
          "encoding": "utf8"
        }
      ],
      "error.stdout:1",
      "error.stdout:2"
    ],
    "stdout": [],
    "stderr": [],
    "error": {
      "name": "Error",
      "message": "audit child sentinel",
      "sameSentinel": true
    }
  },
  {
    "name": "cdk CLI nonstring",
    "trace": [
      [
        "spawn",
        "npm",
        [
          "audit",
          "--json"
        ],
        {
          "cwd": "/synthetic/stynx/infra/cdk",
          "encoding": "utf8"
        }
      ],
      "error.stdout:1"
    ],
    "stdout": [],
    "stderr": [],
    "error": {
      "name": "Error",
      "message": "audit child sentinel",
      "sameSentinel": true
    }
  },
  {
    "name": "cdk version-invalid before malformed report",
    "trace": [
      [
        "spawn",
        "npm",
        [
          "audit",
          "--json"
        ],
        {
          "cwd": "/synthetic/stynx/infra/cdk",
          "encoding": "utf8"
        }
      ],
      [
        "read",
        "/synthetic/stynx/infra/cdk/node_modules/aws-cdk-lib/package.json",
        "utf8"
      ]
    ],
    "stdout": [],
    "stderr": [],
    "error": {
      "name": "SyntaxError",
      "message": "Expected property name or '}' in JSON at position 1 (line 1 column 2)"
    }
  },
  {
    "name": "cdk version-null before malformed report",
    "trace": [
      [
        "spawn",
        "npm",
        [
          "audit",
          "--json"
        ],
        {
          "cwd": "/synthetic/stynx/infra/cdk",
          "encoding": "utf8"
        }
      ],
      [
        "read",
        "/synthetic/stynx/infra/cdk/node_modules/aws-cdk-lib/package.json",
        "utf8"
      ]
    ],
    "stdout": [],
    "stderr": [],
    "error": {
      "name": "TypeError",
      "message": "Cannot read properties of null (reading 'version')"
    }
  }
];
assert.equal(actual.observations.length, expected.length);
for (const observation of expected) {
  test(`audit native boundary: ${observation.name}`, () => {
    assert.deepEqual(actual.observations.find(value => value.name === observation.name), observation);
  });
}
