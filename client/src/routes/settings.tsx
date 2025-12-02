import { Button } from '@client/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@client/components/ui/card';
import { Input } from '@client/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@client/components/ui/table';
import { useWebSocketContext } from '@client/contexts/websocket-context';
import { api } from '@client/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2Icon, PencilIcon, SaveIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/settings')({
  component: RouteComponent,
});

interface CommodityConfig {
  symbol: string;
  vix: number | string;
  vixUpdatable: boolean;
  bidBalance: number;
  multiplier: number;
}

interface CommodityEditState {
  vix?: string;
  bidBalance: string;
  multiplier: string;
}

function RouteComponent() {
  const queryClient = useQueryClient();
  const { updateSdMultiplier, isConnected } = useWebSocketContext();
  const [sdValue, setSdValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Track which commodity row is being edited
  const [editingSymbol, setEditingSymbol] = useState<string | null>(null);
  const [editState, setEditState] = useState<CommodityEditState | null>(null);

  // Fetch current SD multiplier from server
  const {
    data: sdMultiplierData,
    isLoading: isLoadingSdMultiplier,
    isError: isSdMultiplierError,
  } = useQuery({
    queryKey: ['sdMultiplier'],
    queryFn: async () => {
      const res = await api.settings['sd-multiplier'].$get();
      return res.json();
    },
  });

  // Fetch commodity configs
  const {
    data: commoditiesData,
    isLoading: isLoadingCommodities,
    isError: isCommoditiesError,
  } = useQuery({
    queryKey: ['commodities'],
    queryFn: async () => {
      const res = await api.settings.commodities.$get();
      return res.json();
    },
  });

  // Mutation for updating commodity settings
  const updateCommodityMutation = useMutation({
    mutationFn: async ({
      symbol,
      updates,
    }: {
      symbol: string;
      updates: { vix?: number; bidBalance?: number; multiplier?: number };
    }) => {
      const res = await api.settings.commodities[':symbol'].$put({
        param: { symbol: symbol as 'GOLD' },
        json: updates,
      });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Settings updated for ${editingSymbol}`);
        queryClient.invalidateQueries({ queryKey: ['commodities'] });
        setEditingSymbol(null);
        setEditState(null);
      } else {
        toast.error(`Failed to update: ${data.errors?.join(', ')}`);
      }
    },
    onError: (error) => {
      toast.error('Failed to update commodity settings');
      console.error(error);
    },
  });

  // Update local state when data is fetched
  useEffect(() => {
    if (sdMultiplierData?.value !== undefined) {
      setSdValue(sdMultiplierData.value.toString());
    }
  }, [sdMultiplierData]);

  const handleSdSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const value = parseFloat(sdValue);
    if (isNaN(value) || value <= 0) {
      toast.error('Please enter a valid positive number');
      return;
    }

    if (value < 0.5 || value > 5) {
      toast.error('SD Multiplier should be between 0.5 and 5');
      return;
    }

    setIsUpdating(true);
    try {
      updateSdMultiplier(value);
      toast.success(`SD Multiplier updated to ${value}. Resubscribing to options...`);
    } catch (error) {
      toast.error('Failed to update SD Multiplier');
      console.error(error);
    } finally {
      setTimeout(() => setIsUpdating(false), 1000);
    }
  };

  const startEditing = (commodity: CommodityConfig) => {
    setEditingSymbol(commodity.symbol);
    setEditState({
      vix: commodity.vixUpdatable ? String(commodity.vix) : undefined,
      bidBalance: String(commodity.bidBalance),
      multiplier: String(commodity.multiplier),
    });
  };

  const cancelEditing = () => {
    setEditingSymbol(null);
    setEditState(null);
  };

  const saveEditing = () => {
    if (!editingSymbol || !editState) return;

    const commodity = commoditiesData?.commodities.find((c: CommodityConfig) => c.symbol === editingSymbol);
    if (!commodity) return;

    const updates: { vix?: number; bidBalance?: number; multiplier?: number } = {};

    // Only include vix if it's updatable and changed
    if (commodity.vixUpdatable && editState.vix !== undefined) {
      const newVix = parseFloat(editState.vix);
      if (!isNaN(newVix) && newVix > 0 && newVix !== commodity.vix) {
        updates.vix = newVix;
      }
    }

    // Check bidBalance
    const newBidBalance = parseFloat(editState.bidBalance);
    if (!isNaN(newBidBalance) && newBidBalance >= 0 && newBidBalance !== commodity.bidBalance) {
      updates.bidBalance = newBidBalance;
    }

    // Check multiplier
    const newMultiplier = parseFloat(editState.multiplier);
    if (!isNaN(newMultiplier) && newMultiplier > 0 && newMultiplier !== commodity.multiplier) {
      updates.multiplier = newMultiplier;
    }

    if (Object.keys(updates).length === 0) {
      toast.info('No changes to save');
      cancelEditing();
      return;
    }

    updateCommodityMutation.mutate({ symbol: editingSymbol, updates });
  };

  const presetValues = [1.5, 2.0, 2.05, 2.5, 3.0];

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mx-auto max-w-4xl space-y-6'>
        <div>
          <h1 className='text-3xl font-bold'>Settings</h1>
          <p className='text-muted-foreground mt-2'>Configure your option chain filtering parameters</p>
        </div>

        {/* SD Multiplier Card */}
        <Card>
          <CardHeader>
            <CardTitle>SD Multiplier</CardTitle>
            <CardDescription>
              Controls the standard deviation multiplier for filtering options. Higher values show more out-of-the-money
              options.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            {isLoadingSdMultiplier ? (
              <div className='flex items-center justify-center py-8'>
                <Loader2Icon className='text-muted-foreground h-6 w-6 animate-spin' />
                <span className='text-muted-foreground ml-2 text-sm'>Loading current settings...</span>
              </div>
            ) : isSdMultiplierError ? (
              <div className='rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950'>
                <p className='text-sm text-red-800 dark:text-red-200'>Failed to load current SD multiplier value.</p>
              </div>
            ) : (
              <form onSubmit={handleSdSubmit} className='space-y-4'>
                <div className='space-y-2'>
                  <label htmlFor='sd-multiplier' className='text-sm font-medium'>
                    Standard Deviation Multiplier
                  </label>
                  <div className='flex gap-2'>
                    <Input
                      id='sd-multiplier'
                      type='number'
                      step='0.01'
                      min='0.5'
                      max='5'
                      value={sdValue}
                      onChange={(e) => setSdValue(e.target.value)}
                      disabled={!isConnected || isUpdating}
                      placeholder='Enter SD multiplier (e.g., 2.05)'
                    />
                    <Button type='submit' disabled={!isConnected || isUpdating}>
                      {isUpdating ? 'Updating...' : 'Apply'}
                    </Button>
                  </div>
                  <p className='text-muted-foreground text-xs'>Current range: 0.5 - 5.0 (Recommended: 1.5 - 3.0)</p>
                </div>

                <div className='flex flex-col gap-2'>
                  <label className='text-sm font-medium'>Quick Presets</label>
                  <div className='flex flex-wrap gap-2'>
                    {presetValues.map((preset) => (
                      <Button
                        key={preset}
                        type='button'
                        variant='outline'
                        size='sm'
                        onClick={() => setSdValue(preset.toString())}
                        disabled={!isConnected || isUpdating}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                </div>
              </form>
            )}

            {!isConnected && !isLoadingSdMultiplier && (
              <div className='rounded-md border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-950'>
                <p className='text-sm text-yellow-800 dark:text-yellow-200'>
                  ⚠️ WebSocket not connected. Please wait for the connection to be established.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commodity Settings Card */}
        <Card>
          <CardHeader>
            <CardTitle>Commodity Settings</CardTitle>
            <CardDescription>
              Configure VIX (volatility), bid balance, and multiplier for each commodity. Click a row to edit.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingCommodities ? (
              <div className='flex items-center justify-center py-8'>
                <Loader2Icon className='text-muted-foreground h-6 w-6 animate-spin' />
                <span className='text-muted-foreground ml-2 text-sm'>Loading commodity settings...</span>
              </div>
            ) : isCommoditiesError ? (
              <div className='rounded-md border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950'>
                <p className='text-sm text-red-800 dark:text-red-200'>Failed to load commodity settings.</p>
              </div>
            ) : (
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className='w-[140px]'>Symbol</TableHead>
                      <TableHead className='w-[120px]'>VIX</TableHead>
                      <TableHead className='w-[120px]'>Bid Balance</TableHead>
                      <TableHead className='w-[120px]'>Multiplier</TableHead>
                      <TableHead className='w-[100px]'>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commoditiesData?.commodities.map((commodity: CommodityConfig) => {
                      const isEditing = editingSymbol === commodity.symbol;

                      return (
                        <TableRow key={commodity.symbol} className={isEditing ? 'bg-muted/50' : ''}>
                          <TableCell className='font-medium'>{commodity.symbol}</TableCell>
                          <TableCell>
                            {isEditing && commodity.vixUpdatable ? (
                              <Input
                                type='number'
                                step='0.1'
                                min='1'
                                value={editState?.vix ?? ''}
                                onChange={(e) => setEditState((prev) => prev && { ...prev, vix: e.target.value })}
                                className='w-24'
                              />
                            ) : (
                              <span className={commodity.vixUpdatable ? '' : 'text-muted-foreground'}>
                                {commodity.vix}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                type='number'
                                step='0.01'
                                min='0'
                                value={editState?.bidBalance ?? ''}
                                onChange={(e) =>
                                  setEditState((prev) => prev && { ...prev, bidBalance: e.target.value })
                                }
                                className='w-24'
                              />
                            ) : (
                              commodity.bidBalance
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <Input
                                type='number'
                                step='1'
                                min='1'
                                value={editState?.multiplier ?? ''}
                                onChange={(e) =>
                                  setEditState((prev) => prev && { ...prev, multiplier: e.target.value })
                                }
                                className='w-24'
                              />
                            ) : (
                              commodity.multiplier
                            )}
                          </TableCell>
                          <TableCell>
                            {isEditing ? (
                              <div className='flex gap-1'>
                                <Button
                                  variant='default'
                                  onClick={saveEditing}
                                  disabled={updateCommodityMutation.isPending}
                                >
                                  {updateCommodityMutation.isPending ? (
                                    <Loader2Icon className='animate-spin' />
                                  ) : (
                                    <SaveIcon />
                                  )}
                                </Button>
                                <Button
                                  variant='outline'
                                  onClick={cancelEditing}
                                  disabled={updateCommodityMutation.isPending}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <Button variant='outline' onClick={() => startEditing(commodity)}>
                                <PencilIcon />
                                Edit
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className='mt-4 rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950'>
              <h4 className='mb-2 text-sm font-medium text-blue-900 dark:text-blue-100'>About Commodity Settings</h4>
              <ul className='list-inside list-disc space-y-1 text-sm text-blue-800 dark:text-blue-200'>
                <li>
                  <strong>VIX:</strong> Volatility index. Symbols like ^GVZ, ^VXSLV fetch real-time data from Yahoo
                  Finance and are not editable.
                </li>
                <li>
                  <strong>Bid Balance:</strong> Adjustment factor subtracted from bid price for sell value calculation.
                </li>
                <li>
                  <strong>Multiplier:</strong> Contract multiplier used in sell value calculation.
                </li>
                <li>Changes take effect within 5 seconds as settings are cached and refreshed periodically.</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
