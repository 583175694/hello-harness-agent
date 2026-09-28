import * as SliderPrimitive from '@radix-ui/react-slider';
import type { ComponentProps } from 'react';

export function Slider({
  className = '',
  ...props
}: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root className={`ui-slider ${className}`} {...props}>
      <SliderPrimitive.Track className="ui-slider__track">
        <SliderPrimitive.Range className="ui-slider__range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="ui-slider__thumb" aria-label="选择工具调用" />
    </SliderPrimitive.Root>
  );
}
