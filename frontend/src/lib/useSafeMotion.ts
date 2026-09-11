import { useReducedMotion } from 'motion/react';
import { motionTokens } from './motionTokens';

export function useSafeMotion(distance = motionTokens.distance.md) {
  const shouldReduce = useReducedMotion();

  return {
    shouldReduce,
    initial: shouldReduce ? { opacity: 0 } : { opacity: 0, y: distance },
    animate: shouldReduce ? { opacity: 1 } : { opacity: 1, y: 0 },
    exit: shouldReduce ? { opacity: 0 } : { opacity: 0, y: -distance },
    scaleTap: shouldReduce ? 1 : motionTokens.scale.press,
    scaleHover: shouldReduce ? 1 : motionTokens.scale.pop,
  };
}
