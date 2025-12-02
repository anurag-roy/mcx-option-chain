import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/components/ui/table';
import type { MarketDepth } from '@client/types/option-chain';

interface Props {
  depth: MarketDepth;
}

const indices = [0, 1, 2, 3, 4] as const;

export function SellerTable({ depth }: Props) {
  return (
    <div className='rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='min-w-[100px]'>Seller</TableHead>
            <TableHead className='min-w-[8ch] text-right'>Ask</TableHead>
            <TableHead className='min-w-[8ch] text-right'>Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!depth || depth.sell.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3}>No data to display.</TableCell>
            </TableRow>
          ) : (
            indices.map((i) => {
              const entry = depth.sell[i];
              return (
                <TableRow key={i}>
                  <TableCell>Seller {i + 1}</TableCell>
                  <TableCell className='bg-red-50/60 text-right font-semibold tabular-nums text-red-800 dark:bg-red-900/10 dark:text-red-500'>
                    {entry?.price?.toFixed(2) ?? '-'}
                  </TableCell>
                  <TableCell className='bg-red-50/60 text-right font-semibold tabular-nums text-red-800 dark:bg-red-900/10 dark:text-red-500'>
                    {entry?.quantity ?? '-'}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

