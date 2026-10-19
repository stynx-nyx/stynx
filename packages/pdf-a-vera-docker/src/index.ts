/**
 * Public veraPDF Docker validator, runner, parser, error, and option exports.
 *
 * @packageDocumentation
 */
/** Default Docker image and timeout values for veraPDF validation. */
export { DEFAULT_VERAPDF_IMAGE, DEFAULT_VERAPDF_TIMEOUT_MS } from './constants.js';
/** Docker command builder and runner for invoking the veraPDF CLI container. */
export { buildVeraPdfDockerArgs, runVeraPdfDocker } from './docker.js';
/** Runner request and result contracts for adapter tests and custom execution wrappers. */
export type { VeraPdfDockerRunner, VeraPdfDockerRunRequest, VeraPdfDockerRunResult } from './docker.js';
/** Error types for failed container execution and invalid veraPDF reports. */
export { VeraPdfDockerError, VeraPdfReportParseError } from './errors.js';
/** Parser for converting veraPDF JSON output into the shared PDF/A contract result. */
export { parseVeraPdfJson } from './parse-report.js';
/** PDF/A validator implementation and profile-flavour helper backed by veraPDF Docker. */
export { VeraPdfDockerValidator, flavourFrom } from './validator.js';
/** Options for configuring the veraPDF Docker validator runtime. */
export type { VeraPdfDockerValidatorOptions } from './validator.js';
