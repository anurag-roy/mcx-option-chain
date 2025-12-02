import { Card, CardDescription, CardHeader, CardTitle } from '@client/components/ui/card';
import { PAGE_CONFIGS } from '@client/types/option-chain';
import { Link, createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: RouteComponent,
});

const gradients = [
  'bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-orange-500/20 dark:from-amber-500/10 dark:via-yellow-500/5 dark:to-orange-500/10',
  'bg-gradient-to-br from-slate-400/20 via-zinc-300/10 to-gray-400/20 dark:from-slate-400/10 dark:via-zinc-500/5 dark:to-gray-500/10',
  'bg-gradient-to-br from-emerald-500/20 via-teal-500/10 to-cyan-500/20 dark:from-emerald-500/10 dark:via-teal-500/5 dark:to-cyan-500/10',
];

const borderColors = [
  'hover:border-amber-500/50 dark:hover:border-amber-400/50',
  'hover:border-slate-400/50 dark:hover:border-slate-300/50',
  'hover:border-emerald-500/50 dark:hover:border-emerald-400/50',
];

const badgeColors = [
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-slate-100 text-slate-800 dark:bg-slate-800/40 dark:text-slate-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
];

function RouteComponent() {
  return (
    <div className='container mx-auto flex min-h-[calc(100vh-8rem)] flex-col px-4'>
      <h1 className='mb-8 text-2xl font-semibold'>Select a commodity group to view options</h1>

      <div className='grid flex-1 grid-cols-1 gap-6 md:grid-cols-3'>
        {PAGE_CONFIGS.map((config, index) => (
          <Link key={config.id} to={config.path} className='group'>
            <Card
              className={`h-full border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${gradients[index]} ${borderColors[index]}`}
            >
              <CardHeader className='flex h-full flex-col items-center justify-center py-12 text-center'>
                <div className='mb-4 text-6xl drop-shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:drop-shadow-xl'>
                  {config.icon}
                </div>
                <CardTitle className='text-2xl font-bold'>{config.name}</CardTitle>
                <CardDescription className='mt-2 text-base'>{config.description}</CardDescription>
                <div className='mt-5 flex flex-wrap justify-center gap-2'>
                  {config.tables.flatMap((t) =>
                    t.symbols.map((symbol) => (
                      <span
                        key={symbol}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeColors[index]}`}
                      >
                        {symbol}
                      </span>
                    ))
                  )}
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
