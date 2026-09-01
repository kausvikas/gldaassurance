/**
 * Public surface — platform/decimal.
 *
 * The only place in the system permitted to import `decimal.js`
 * (architecture/manifest.json → layers.platform.allowedExternal).
 * No context may reach a raw `Decimal`; they receive `Money` and `Ratio`.
 */
export { Money, type MoneyDto } from './money.js';
export {
  SUPPORTED_CURRENCIES,
  type CurrencyCode,
  CurrencyMismatchError,
  isCurrencyCode,
  minorUnits,
} from './currency.js';
export {
  type Quantity,
  Q_ZERO, Q_ONE, Q_HUNDRED,
  qty, qAdd, qSub, qMul, qDiv, qNeg, qAbs, qCompare, qIsZero, qIsNegative,
  qMin, qMax, qClamp, qFixed, qWeightedMean, qNormaliseScore, qToNumber, parseBoundedCount,
} from './quantity.js';
export {
  type FxRate,
  type FxRateType,
  type ConvertedMoney,
  type FxRateProvider,
  FxRateMissingError,
  FxRateMismatchError,
  convert,
  sumInReportingCurrency,
} from './fx.js';
export {
  type Ratio,
  type ComputedRatio,
  type NotComputable,
  type NotComputableReason,
  ratio,
  notComputable,
  isComputable,
  ratioToPercentString,
  ratioToQuantity,
  ratioFromQuantity,
  ratioSubtractQuantity,
} from './ratio.js';
