import { Button } from '@client/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@client/components/ui/card';
import { useWebSocketContext } from '@client/contexts/websocket-context';
import { api } from '@client/lib/api';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export const Route = createFileRoute('/settings')({
  component: RouteComponent,
});

function RouteComponent() {
  const { updateSdMultiplier, isConnected } = useWebSocketContext();
  const [sdValue, setSdValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

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

  // Update local state when data is fetched
  useEffect(() => {
    if (sdMultiplierData?.value !== undefined) {
      setSdValue(sdMultiplierData.value.toString());
    }
  }, [sdMultiplierData]);

  const handleSubmit = (e: React.FormEvent) => {
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
      // Reset after a short delay to show feedback
      setTimeout(() => setIsUpdating(false), 1000);
    }
  };

  const presetValues = [1.5, 2.0, 2.05, 2.5, 3.0];

  return (
    <div className='container mx-auto px-4 py-8'>
      <div className='mx-auto max-w-2xl space-y-6'>
        <div>
          <h1 className='text-3xl font-bold'>Settings</h1>
          <p className='text-muted-foreground mt-2'>Configure your option chain filtering parameters</p>
        </div>

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
              <form onSubmit={handleSubmit} className='space-y-4'>
                <div className='space-y-2'>
                  <label htmlFor='sd-multiplier' className='text-sm font-medium'>
                    Standard Deviation Multiplier
                  </label>
                  <div className='flex gap-2'>
                    <input
                      id='sd-multiplier'
                      type='number'
                      step='0.01'
                      min='0.5'
                      max='5'
                      value={sdValue}
                      onChange={(e) => setSdValue(e.target.value)}
                      disabled={!isConnected || isUpdating}
                      className='border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex h-10 w-full rounded-md border px-3 py-2 text-sm file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50'
                      placeholder='Enter SD multiplier (e.g., 2.05)'
                    />
                    <Button type='submit' disabled={!isConnected || isUpdating}>
                      {isUpdating ? 'Updating...' : 'Apply'}
                    </Button>
                  </div>
                  <p className='text-muted-foreground text-xs'>Current range: 0.5 - 5.0 (Recommended: 1.5 - 3.0)</p>
                </div>

                <div className='space-y-2'>
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

            <div className='rounded-md border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950'>
              <h4 className='mb-2 text-sm font-medium text-blue-900 dark:text-blue-100'>How SD Multiplier Works</h4>
              <ul className='list-inside list-disc space-y-1 text-sm text-blue-800 dark:text-blue-200'>
                <li>Lower values (1.5-2.0): Show fewer, near-the-money options</li>
                <li>Default value (2.05): Balanced selection of options</li>
                <li>Higher values (2.5-3.0): Show more out-of-the-money options</li>
                <li>Changes apply immediately and trigger resubscription</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connection Status</CardTitle>
            <CardDescription>WebSocket connection information</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex items-center gap-2'>
              <div className={`h-3 w-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className='text-sm font-medium'>{isConnected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
