import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@client/components/ui/dialog';
import { cn } from '@client/lib/utils';
import type { OptionChain } from '@client/types/option-chain';
import { comparePricesAtTickSize, inferBuyerImpliedVolatility } from '@shared/black76';
import { format } from 'date-fns';
import { useMemo } from 'react';

interface Black76InsightCardProps {
  option: OptionChain | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatPrice(value: number, maximumFractionDigits = 4) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits,
  }).format(value);
}

function getTickComparison(option: OptionChain) {
  if (option.black76FairPrice === null || option.tickSize === null || option.tickSize <= 0) return 'unavailable';
  return comparePricesAtTickSize(option.bid, option.black76FairPrice, option.tickSize) ?? 'unavailable';
}

export function Black76InsightCard({ option, open, onOpenChange }: Black76InsightCardProps) {
  const futuresPrice = option?.futuresReferencePrice ?? NaN;
  const strikePrice = option?.strike ?? NaN;
  const buyerPrice = option?.bid ?? NaN;
  const buyerQuantity = option?.marketDepth?.buy[0]?.quantity ?? 0;
  const timeToExpiry = option?.black76TimeToExpiry ?? NaN;
  const discountFactor = option?.black76DiscountFactor ?? NaN;
  const type = option?.instrumentType;

  // Only the selected, open card solves IV, and only when a solver input changes.
  const buyerIv = useMemo(() => {
    if (!open) return null;
    if (!Number.isFinite(buyerQuantity) || buyerQuantity <= 0 || (type !== 'CE' && type !== 'PE')) {
      return { status: 'IV_UNAVAILABLE' } as const;
    }

    return inferBuyerImpliedVolatility({ futuresPrice, strikePrice, buyerPrice, timeToExpiry, discountFactor, type });
  }, [open, futuresPrice, strikePrice, buyerPrice, buyerQuantity, timeToExpiry, discountFactor, type]);

  if (!option) return null;

  const fairPrice = option.black76FairPrice;
  const isAvailable = option.black76Status === 'AVAILABLE' && fairPrice !== null;
  const comparison = getTickComparison(option);
  const edgeClass =
    comparison === 'higher'
      ? 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/35 dark:text-emerald-400'
      : comparison === 'lower'
        ? 'bg-red-500/10 text-red-700 ring-red-500/35 dark:text-red-400'
        : 'bg-sky-500/10 text-sky-700 ring-sky-500/35 dark:text-sky-400';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='gap-0 overflow-hidden p-0 sm:max-w-xl'
        data-buyer-iv-status={buyerIv?.status}
        data-buyer-iv-expiry={buyerIv?.status === 'AVAILABLE' ? buyerIv.expiryVolatility : undefined}
        data-buyer-iv-annual={buyerIv?.status === 'AVAILABLE' ? buyerIv.annualVolatility : undefined}
        data-buyer-iv-repriced={buyerIv?.status === 'AVAILABLE' ? buyerIv.repricedBuyerPrice : undefined}
      >
        <DialogHeader className='border-b px-6 py-5 pr-14'>
          <DialogTitle className='text-xl leading-tight text-balance'>
            {option.name} {format(new Date(option.expiry), 'dd MMM')} {option.strike} {option.instrumentType}
          </DialogTitle>
          <DialogDescription className='sr-only'>Black-76 seller insight</DialogDescription>
        </DialogHeader>

        {!isAvailable ? (
          <div className='px-6 py-12 text-center'>
            <p className='text-base font-semibold'>MODEL UNAVAILABLE</p>
            <p className='text-muted-foreground mt-2 text-sm text-pretty'>
              A valid futures book, volatility input, strike, and remaining expiry time are required.
            </p>
          </div>
        ) : (
          <div className='divide-y px-6'>
            <InsightRow label='Futures Ref Price' value={formatPrice(option.futuresReferencePrice!)} />
            <InsightRow label='Buyer 1' value={formatPrice(option.bid)} />
            <InsightRow label='Black-76 Fair Price' value={formatPrice(fairPrice)} />

            <div className='py-3'>
              <div
                className={cn(
                  'flex items-center justify-between gap-4 rounded-lg px-4 py-4 ring-1 ring-inset',
                  edgeClass
                )}
              >
                <span className='text-sm font-medium'>Difference</span>
                <span className='text-lg font-semibold tabular-nums'>
                  {formatSignedCurrency(option.black76Difference!)} <span className='mx-1 opacity-50'>|</span>{' '}
                  {formatDifferencePercent(option.black76DifferencePercent)}
                </span>
              </div>
            </div>

            <InsightRow label='Delta (futures sensitivity)' value={formatSigned(option.delta, '', 6)} />
          </div>
        )}

        <div className='text-muted-foreground border-t px-6 py-4 text-xs font-medium tracking-wide'>
          NRML <span aria-hidden='true'>•</span> SELL <span aria-hidden='true'>•</span> LIMIT only
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex min-h-16 items-center justify-between gap-6 py-4'>
      <span className='text-muted-foreground text-sm'>{label}</span>
      <span className='text-lg font-semibold tabular-nums'>{value}</span>
    </div>
  );
}

function formatSigned(value: number, suffix = '', fractionDigits = 2) {
  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    signDisplay: 'always',
  }).format(value);
  return `${formatted}${suffix}`;
}

function formatDifferencePercent(value: number | null) {
  if (value === null || !Number.isFinite(value) || Math.abs(value) > 1000) return 'N/A';
  return formatSigned(value, '%');
}

function formatSignedCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'always',
  }).format(value);
}
