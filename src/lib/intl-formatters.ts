function stableKey(options: Record<string, unknown> | undefined): string {
  if (!options) return "";
  const keys = Object.keys(options).sort();
  return keys.map((key) => `${key}:${String(options[key])}`).join("|");
}

const numberFormatCache = new Map<string, Map<string, Intl.NumberFormat>>();
const dateTimeFormatCache = new Map<string, Map<string, Intl.DateTimeFormat>>();
const collatorCache = new Map<string, Map<string, Intl.Collator>>();

export function getNumberFormatter(
  locale: string | undefined,
  options?: Intl.NumberFormatOptions,
): Intl.NumberFormat {
  const localeKey = locale ?? "";
  const optionKey = stableKey(options as Record<string, unknown> | undefined);

  const forLocale =
    numberFormatCache.get(localeKey) ?? new Map<string, Intl.NumberFormat>();
  numberFormatCache.set(localeKey, forLocale);

  const cached = forLocale.get(optionKey);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat(locale, options);
  forLocale.set(optionKey, formatter);
  return formatter;
}

export function getDateTimeFormatter(
  locale: string | undefined,
  options?: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const localeKey = locale ?? "";
  const optionKey = stableKey(options as Record<string, unknown> | undefined);

  const forLocale =
    dateTimeFormatCache.get(localeKey) ?? new Map<string, Intl.DateTimeFormat>();
  dateTimeFormatCache.set(localeKey, forLocale);

  const cached = forLocale.get(optionKey);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat(locale, options);
  forLocale.set(optionKey, formatter);
  return formatter;
}

export function getCollator(
  locale: string | undefined,
  options?: Intl.CollatorOptions,
): Intl.Collator {
  const localeKey = locale ?? "";
  const optionKey = stableKey(options as Record<string, unknown> | undefined);

  const forLocale =
    collatorCache.get(localeKey) ?? new Map<string, Intl.Collator>();
  collatorCache.set(localeKey, forLocale);

  const cached = forLocale.get(optionKey);
  if (cached) return cached;

  const collator = new Intl.Collator(locale, options);
  forLocale.set(optionKey, collator);
  return collator;
}
