export class PdfError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class PdfValidationError extends PdfError {}

export class PdfProfileUnsupportedError extends PdfError {
  constructor() {
    super('PDF/A output requires a configured PDF/A conformance adapter');
  }
}

export class PdfRenderError extends PdfError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
  }
}
