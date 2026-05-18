import { ErrorTranslatorService } from '../../src/error-translator.service';

describe('ErrorTranslatorService', () => {
  it('delegates translate(key, locale, vars) to LocaleService.t', () => {
    const t = jest.fn().mockReturnValue('translated');
    const localeService = { t } as unknown as import('../../src/locale.service').LocaleService;
    const svc = new ErrorTranslatorService(localeService);

    const out = svc.translate('error.boom', 'pt-BR', { reason: 'x' });

    expect(out).toBe('translated');
    expect(t).toHaveBeenCalledWith('error.boom', { reason: 'x' }, 'pt-BR');
  });

  it('passes empty vars when none provided', () => {
    const t = jest.fn().mockReturnValue('translated');
    const localeService = { t } as unknown as import('../../src/locale.service').LocaleService;
    const svc = new ErrorTranslatorService(localeService);

    svc.translate('error.empty', 'en-US');

    expect(t).toHaveBeenCalledWith('error.empty', {}, 'en-US');
  });
});
