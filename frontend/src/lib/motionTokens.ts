/**
 * MedConnect Pulse Motion System Tokens & Springs
 * Compliant with motion-ui v4.2 and motion-patterns standards.
 */

export const motionTokens = {
  duration: {
    fast: 0.18,
    normal: 0.35,
    slow: 0.6,
  },
  easing: {
    smooth: [0.22, 1, 0.36, 1] as [number, number, number, number],
    sharp: [0.4, 0, 0.2, 1] as [number, number, number, number],
  },
  distance: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  scale: {
    pop: 1.02,
    press: 0.97,
    subtle: 0.95,
  },
};

export const springs = {
  snappy: { type: 'spring', stiffness: 400, damping: 30 },
  gentle: { type: 'spring', stiffness: 200, damping: 25 },
  bouncy: { type: 'spring', stiffness: 300, damping: 15 },
  smooth: { type: 'spring', stiffness: 260, damping: 20 },
} as const;

export const staggerVariants = {
  container: {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.07,
        delayChildren: 0.05,
      },
    },
  },
  item: {
    hidden: { opacity: 0, y: motionTokens.distance.md },
    visible: {
      opacity: 1,
      y: 0,
      transition: springs.gentle,
    },
    exit: {
      opacity: 0,
      y: -motionTokens.distance.sm,
      transition: { duration: motionTokens.duration.fast },
    },
  },
};

export const pageTransitionVariants = {
  initial: { opacity: 0, y: motionTokens.distance.sm },
  enter: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motionTokens.duration.normal,
      ease: motionTokens.easing.smooth,
    },
  },
  exit: {
    opacity: 0,
    y: -motionTokens.distance.sm,
    transition: {
      duration: motionTokens.duration.fast,
      ease: motionTokens.easing.sharp,
    },
  },
};
