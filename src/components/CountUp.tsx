import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';
import { fmt } from './format';

export function CountUp({ to, duration = 1.6, delay = 0, format = fmt }: { to: number; duration?: number; delay?: number; format?: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [value, setValue] = useState(reduce ? to : 0);
  useEffect(() => {
    if (reduce) {
      setValue(to);
      return;
    }
    const controls = animate(0, to, { duration, delay, ease: [0.16, 1, 0.3, 1], onUpdate: setValue });
    return () => controls.stop();
  }, [to, duration, delay, reduce]);
  return <span className="tabular">{format(value)}</span>;
}
