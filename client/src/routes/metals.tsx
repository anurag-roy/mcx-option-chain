import { CommodityPage } from '@client/components/commodity-page';
import { PAGE_CONFIGS } from '@client/types/option-chain';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/metals')({
  component: RouteComponent,
});

function RouteComponent() {
  const config = PAGE_CONFIGS.find((c) => c.id === 'metals')!;

  return <CommodityPage title={config.name} tables={config.tables} />;
}

