import { Button } from '@client/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@client/components/ui/dialog';
import { Input } from '@client/components/ui/input';
import { api } from '@client/lib/api';
import type { OptionChain } from '@client/types/option-chain';
import { useMutation } from '@tanstack/react-query';
import { InfoIcon } from 'lucide-react';
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

  // Reset quantity when a different option is selected
  useEffect(() => {
    setQuantity(1);
  }, [option?.instrumentToken]);

  const placeSellOrderMutation = useMutation({
    mutationFn: async () => {
      if (!option) throw new Error('No option selected');

      const res = await api.orders.sell.$post({
        json: {
          tradingsymbol: option.tradingsymbol,
          price: option.bid,
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
          </div>

          {/* Seller Table */}
          <SellerTable depth={option.marketDepth} />
        </div>

        {/* Quantity Input Section */}
        <div className='mx-auto mb-8 grid max-w-sm grid-cols-[repeat(5,auto)] items-center gap-2 px-4'>
          <span className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>Margin</span>
          <span></span>
          <label htmlFor='quantity' className='block text-sm font-medium text-zinc-700 dark:text-zinc-300'>
            Quantity
          </label>
          <span></span>
          <span className='text-sm font-medium text-zinc-700 dark:text-zinc-300'>Total</span>
          <Input value={marginPerQty.toFixed(2)} disabled className='w-28' />
          <span className='text-sm font-medium text-zinc-500'>×</span>
          <Input
            type='number'
            name='quantity'
            id='quantity'
            value={quantity}
            min={1}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className='w-20'
          />
          <span className='text-sm font-medium text-zinc-500'>=</span>
          <Input value={totalMargin.toFixed(2)} disabled className='w-28' />
        </div>

        {/* Action Buttons */}
        <div className='flex flex-row-reverse gap-4'>
          <Button
            type='button'
            size='lg'
            disabled={option.strikePosition > 30 || placeSellOrderMutation.isPending}
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
