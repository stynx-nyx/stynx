export class VeraPdfDockerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VeraPdfDockerError';
  }
}

export class VeraPdfReportParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VeraPdfReportParseError';
  }
}
