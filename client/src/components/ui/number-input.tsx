import { cn } from '@client/lib/utils';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { Button, Group, Input, NumberField, type NumberFieldProps } from 'react-aria-components';

interface NumberInputProps extends Omit<NumberFieldProps, 'children'> {
  className?: string;
  inputClassName?: string;
}

export function NumberInput({ className, inputClassName, ...props }: NumberInputProps) {
  return (
    <NumberField {...props}>
      <Group
        className={cn(
          'relative inline-flex h-9 w-full items-center overflow-hidden whitespace-nowrap rounded-md border border-input text-sm shadow-xs outline-none transition-[color,box-shadow] data-focus-within:border-ring data-disabled:opacity-50 data-focus-within:ring-[3px] data-focus-within:ring-ring/50',
          className
        )}
      >
        <Button
          className='-ms-px flex aspect-square h-[inherit] items-center justify-center rounded-s-md border border-input bg-background text-muted-foreground/80 text-sm transition-[color,box-shadow] hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'
          slot='decrement'
        >
          <MinusIcon aria-hidden='true' size={16} />
        </Button>
        <Input
          className={cn(
            'w-full grow bg-background px-3 py-2 text-center text-foreground tabular-nums',
            inputClassName
          )}
        />
        <Button
          className='-me-px flex aspect-square h-[inherit] items-center justify-center rounded-e-md border border-input bg-background text-muted-foreground/80 text-sm transition-[color,box-shadow] hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'
          slot='increment'
        >
          <PlusIcon aria-hidden='true' size={16} />
        </Button>
      </Group>
    </NumberField>
  );
}

