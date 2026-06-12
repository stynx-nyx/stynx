/**
 * Public veraPDF Docker validator, runner, parser, error, and option exports.
 *
 * @packageDocumentation
 */
/** Default Docker image and timeout values for veraPDF validation. */
export { DEFAULT_VERAPDF_IMAGE, DEFAULT_VERAPDF_TIMEOUT_MS } from './constants';
/** Docker command builder and runner for invoking the veraPDF CLI container. */
export { buildVeraPdfDockerArgs, runVeraPdfDocker } from './docker';
/** Runner request and result contracts for adapter tests and custom execution wrappers. */
export type { VeraPdfDockerRunner, VeraPdfDockerRunRequest, VeraPdfDockerRunResult } from './docker';
/** Error types for failed container execution and invalid veraPDF reports. */
export { VeraPdfDockerError, VeraPdfReportParseError } from './errors';
/** Parser for converting veraPDF JSON output into the shared PDF/A contract result. */
export { parseVeraPdfJson } from './parse-report';
/** PDF/A validator implementation and profile-flavour helper backed by veraPDF Docker. */
export { VeraPdfDockerValidator, flavourFrom } from './validator';
/** Options for configuring the veraPDF Docker validator runtime. */
export type { VeraPdfDockerValidatorOptions } from './validator';
