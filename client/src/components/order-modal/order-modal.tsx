import { Button } from '@client/components/ui/button';
import { Checkbox } from '@client/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@client/components/ui/dialog';
import { Input } from '@client/components/ui/input';
import { NumberInput } from '@client/components/ui/number-input';
import { useUserMargin } from '@client/hooks/use-user-margin';
import { api } from '@client/lib/api';
import { cn } from '@client/lib/utils';
import type { OptionChain } from '@client/types/option-chain';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangleIcon, InfoIcon, PencilIcon, WalletIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BuyerTable } from './buyer-table';
import { SellerTable } from './seller-table';

interface OrderModalProps {
  option: OptionChain | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function displayInr(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(value);
}

export function OrderModal({ option, open, onOpenChange }: OrderModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [overridePriceEnabled, setOverridePriceEnabled] = useState(false);
  const [overridePrice, setOverridePrice] = useState<number>(0);

  // Fetch user margin
  const { data: marginData } = useUserMargin();

  // Calculate smart default quantity ONLY when a new option is selected (modal opens)
  // This runs once per option, then user can freely adjust quantity without it resetting
  useEffect(() => {
    if (!option) return;

    const userMargin = marginData?.net ?? 0;
    const orderMargin = option.orderMargin;
    const buyer1Qty = option.marketDepth?.buy[0]?.quantity ?? 0;

    // Step 1: Max quantity user can afford
    const maxAffordableQty = orderMargin > 0 ? Math.floor(userMargin / orderMargin) : 0;

    // Step 2: Limit by buyer 1's quantity (to ensure order executes at buyer 1's price)
    // Math.max(1, ...) ensures we never go below 1 for proper margin shortfall display
    const smartQty = Math.max(1, Math.min(maxAffordableQty, buyer1Qty));

    setQuantity(smartQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [option?.instrumentToken]);

  // Reset override price when option changes
  useEffect(() => {
    setOverridePriceEnabled(false);
    setOverridePrice(option?.bid ?? 0);
  }, [option?.instrumentToken]);

  const placeSellOrderMutation = useMutation({
    mutationFn: async () => {
      if (!option) throw new Error('No option selected');

      // Use override price if enabled, otherwise use buyer 1's bid
      const limitPrice = overridePriceEnabled ? overridePrice : option.bid;

      const res = await api.orders.sell.$post({
        json: {
          tradingsymbol: option.tradingsymbol,
          price: limitPrice,
          quantity,
        },
      });

      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Order placed successfully! Order ID: ${data.order_id}`);
        onOpenChange(false);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to place order');
    },
  });

  if (!option) return null;

  const buyerPrice1 = option.bid;
  const marginPerQty = option.orderMargin;
  const totalMargin = marginPerQty * quantity;
  const netReturn = totalMargin > 0 ? (option.returnValue * 100).toFixed(2) : '-';

  // Calculate margin status
  const userMargin = marginData?.net ?? 0;
  const hasMarginData = marginData?.net !== undefined;
  const marginDifference = userMargin - totalMargin;
  const hasMarginShortfall = hasMarginData && marginDifference < 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-5xl'>
        <DialogHeader>
          <DialogTitle>
            {option.name} {option.strike}
            {option.instrumentType}
          </DialogTitle>
          <DialogDescription>
            Place sell order for {option.name} {option.strike}
            {option.instrumentType}
          </DialogDescription>
        </DialogHeader>

        <div className='mt-8 mb-8 flex items-start gap-12'>
          {/* Buyer Table */}
          <BuyerTable depth={option.marketDepth} />

          {/* Center Info Section */}
          <div className='mx-auto grid max-w-sm grid-cols-[auto,auto] gap-6'>
            {/* Net Return Info */}
            <div className='col-span-2 flex items-center gap-1 rounded-md bg-blue-50/50 px-4 py-3 text-blue-800 ring-1 ring-blue-700/20 ring-inset dark:border-blue-500/30 dark:bg-blue-500/5 dark:text-blue-200'>
              <InfoIcon className='h-4 w-4 fill-blue-600 dark:fill-blue-200/50' aria-hidden='true' />
              <span className='text-sm font-semibold text-blue-700 dark:text-blue-500'>
                Net Return on this margin is:
              </span>
              <span className='ml-2 text-xl font-bold'>{netReturn}%</span>
            </div>

            {/* Price */}
            <div className='rounded-md bg-emerald-50/50 p-4 text-emerald-800 ring-1 ring-emerald-700/20 ring-inset dark:border-emerald-500/30 dark:bg-emerald-500/5 dark:text-emerald-200'>
              <h4 className='text-sm font-semibold text-emerald-700 dark:text-emerald-500'>Price</h4>
              <p className='text-2xl font-bold'>{displayInr(buyerPrice1)}</p>
            </div>

            {/* Margin */}
            <div className='rounded-md bg-zinc-50/50 p-4 text-zinc-800 ring-1 ring-zinc-700/20 ring-inset dark:border-zinc-500/30 dark:bg-zinc-500/5 dark:text-zinc-200'>
              <h4 className='text-sm font-semibold text-zinc-700 dark:text-zinc-500'>Margin Required</h4>
              <p className='text-2xl font-bold'>{displayInr(totalMargin)}</p>
            </div>

            {/* Override Limit Price */}
            <label
              className={cn(
                'col-span-2 flex cursor-pointer items-center gap-3 rounded-md px-4 py-3 ring-1 transition-colors ring-inset',
                overridePriceEnabled
                  ? 'bg-blue-50/50 text-blue-800 ring-blue-700/20 dark:bg-blue-500/5 dark:text-blue-200'
                  : 'bg-zinc-50/50 text-zinc-800 ring-zinc-700/20 dark:bg-zinc-500/5 dark:text-zinc-200'
              )}
            >
              <Checkbox
                checked={overridePriceEnabled}
                onCheckedChange={(checked) => {
                  const isChecked = checked === true;
                  setOverridePriceEnabled(isChecked);
                  // Pre-fill with current buyer 1 price when enabling
                  if (isChecked) {
                    setOverridePrice(option.bid);
                  }
                }}
              />

              <PencilIcon
                className={cn(
                  'h-4 w-4',
                  overridePriceEnabled ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-500 dark:text-zinc-400'
                )}
                aria-hidden='true'
              />
              <span
                className={cn(
                  'text-sm font-semibold',
                  overridePriceEnabled ? 'text-blue-700 dark:text-blue-400' : 'text-zinc-700 dark:text-zinc-400'
                )}
              >
                Override Limit Price:
              </span>
              <NumberInput
                value={overridePrice}
                onChange={setOverridePrice}
                step={0.05}
                minValue={0.05}
                formatOptions={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                isDisabled={!overridePriceEnabled}
                className='ml-auto w-32'
                inputClassName={cn(!overridePriceEnabled && 'opacity-50')}
              />
            </label>

            {/* Margin Status - Shortfall or Remaining */}
            {hasMarginData && (
              <div
                className={`col-span-2 flex items-center gap-2 rounded-md px-4 py-3 ring-1 ring-inset ${
                  hasMarginShortfall
                    ? 'bg-red-50/50 text-red-800 ring-red-700/20 dark:bg-red-500/5 dark:text-red-200'
                    : 'bg-emerald-50/50 text-emerald-800 ring-emerald-700/20 dark:bg-emerald-500/5 dark:text-emerald-200'
                }`}
              >
                {hasMarginShortfall ? (
                  <AlertTriangleIcon className='h-4 w-4 text-red-600 dark:text-red-400' aria-hidden='true' />
                ) : (
                  <WalletIcon className='h-4 w-4 text-emerald-600 dark:text-emerald-400' aria-hidden='true' />
                )}
                <span
                  className={`text-sm font-semibold ${
                    hasMarginShortfall ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {hasMarginShortfall ? 'Margin Shortfall:' : 'Remaining Margin:'}
                </span>
                <span className='ml-auto text-xl font-bold'>{displayInr(Math.abs(marginDifference))}</span>
              </div>
            )}
          </div>

          {/* Seller Table */}
          <SellerTable depth={option.marketDepth} />
        </div>

        {/* Quantity Input Section */}
        <div className='mx-auto mb-8 grid max-w-sm grid-cols-[repeat(5,auto)] items-center gap-2 px-4'>
          <span className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>Margin</span>
          <span></span>
          <span className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>Quantity</span>
          <span></span>
          <span className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>Total</span>
          <Input value={marginPerQty.toFixed(2)} disabled className='w-28' />
          <span className='text-sm font-medium text-zinc-500'>×</span>
          <NumberInput value={quantity} onChange={setQuantity} step={1} minValue={1} className='w-28' />
          <span className='text-sm font-medium text-zinc-500'>=</span>
          <Input value={totalMargin.toFixed(2)} disabled className='w-28' />
        </div>

        {/* Action Buttons */}
        <div className='flex flex-row-reverse gap-4'>
          <Button
            type='button'
            size='lg'
            disabled={hasMarginShortfall || placeSellOrderMutation.isPending}
            isLoading={placeSellOrderMutation.isPending}
            loadingText='Placing Order...'
            onClick={() => placeSellOrderMutation.mutate()}
          >
            Place Sell Order
          </Button>
          <DialogClose asChild>
            <Button type='button' size='lg' variant='ghost'>
              Cancel
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
