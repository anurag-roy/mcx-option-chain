import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/components/ui/table';
import type { MarketDepth } from '@client/types/option-chain';

interface Props {
  depth: MarketDepth;
}

const indices = [0, 1, 2, 3, 4] as const;

export function BuyerTable({ depth }: Props) {
  return (
    <div className='rounded-md border'>
      <Table>
        <TableHeader>
          <TableRow className='divide-x'>
            <TableHead className='min-w-[100px]'>Buyer</TableHead>
            <TableHead className='min-w-[8ch] text-right'>Bid</TableHead>
            <TableHead className='min-w-[8ch] text-right'>Qty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!depth || depth.buy.length === 0 ? (
            <TableRow>
              <TableCell colSpan={3}>No data to display.</TableCell>
            </TableRow>
          ) : (
            indices.map((i) => {
              const entry = depth.buy[i];
              return (
                <TableRow key={i} className='divide-x'>
                  <TableCell>Buyer {i + 1}</TableCell>
                  <TableCell className='bg-blue-50/60 text-right font-semibold text-blue-800 tabular-nums dark:bg-blue-900/10 dark:text-blue-500'>
                    {entry?.price?.toFixed(2) ?? '-'}
                  </TableCell>
                  <TableCell className='bg-blue-50/60 text-right font-semibold text-blue-800 tabular-nums dark:bg-blue-900/10 dark:text-blue-500'>
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
