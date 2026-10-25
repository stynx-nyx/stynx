import type { ErrorTranslator } from '@stynx-nyx/core';
import type { CatalogService, LocaleService, ErrorTranslatorService } from '@stynx-nyx/i18n';
import type { RenderedContent, ChannelSendInput, ChannelAdapter } from '@stynx-nyx/notifications';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
type Assert<T extends true> = T;
export type NativeResults = [
  Assert<Equal<ReturnType<CatalogService['translate']>, unknown>>,
  Assert<Equal<ReturnType<LocaleService['t']>, unknown>>,
  Assert<Equal<ReturnType<ErrorTranslatorService['translate']>, unknown>>,
  Assert<Equal<ReturnType<ErrorTranslator['translate']>, unknown>>,
  Assert<Equal<RenderedContent['body'], unknown>>,
  Assert<Equal<RenderedContent['subject'], unknown>>,
  Assert<Equal<RenderedContent['inAppTitle'], unknown>>,
  Assert<Equal<ChannelSendInput['body'], unknown>>,
  Assert<Equal<ChannelSendInput['subject'], unknown>>
];
export function consume(catalog: CatalogService, locale: LocaleService, translator: ErrorTranslator, rendered: RenderedContent) {
  const value = catalog.translate('key', 'en-US');
  // @ts-expect-error Native formatter outputs require narrowing before string use.
  value.toUpperCase();
  // @ts-expect-error Locale forwarding does not promise a string.
  const translated: string = locale.t('key');
  // @ts-expect-error ErrorTranslator forwarding does not promise a string.
  const error: string = translator.translate('key', 'en-US');
  // @ts-expect-error Notification bodies retain the native formatter result domain.
  rendered.body.slice(0, 1);
  if (typeof value === 'string') value.toUpperCase();
  return { translated, error, value };
}
export const adapter: ChannelAdapter = {
  channel: 'email',
  async send(input) {
    const body: unknown = input.body;
    // @ts-expect-error Adapter consumers must narrow before string-only operations.
    input.body.toUpperCase();
    if (typeof body === 'string') body.toUpperCase();
    return { status: 'SENT' };
  },
};
