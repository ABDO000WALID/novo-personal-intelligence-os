import { useRef, useEffect } from 'react';

export function useRenderCount(componentName: string) {
  const renderCount = useRef(0);
  
  if (process.env.NODE_ENV === 'development') {
    renderCount.current += 1;
    console.log(`[RENDER] ${componentName} rendered ${renderCount.current} times`);
  }
}
