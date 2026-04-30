export default class IntlMessageFormat {
  constructor(
    private readonly template: string,
    private readonly locale: string,
  ) {}

  format(values: Record<string, unknown> = {}): string {
    void this.locale;
    return this.template
      .replace(/\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\s*\}/gu, (_match, key, one, other) => {
        const value = Number(values[key]);
        const selected = value === 1 ? one : other;
        return selected.replace(/#/gu, String(value));
      })
      .replace(/\{(\w+)\}/gu, (_match, key) => String(values[key] ?? ''));
  }
}
