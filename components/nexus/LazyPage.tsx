'use client';

import { Suspense, lazy, ComponentType } from 'react';
import { PageLoader } from './PageLoader';

export function LazyPage(PageComponent: Promise<{ default: ComponentType<any> }>) {
  const LazyComponent = lazy(() => PageComponent);
  
  return function LazyPageWrapper(props: any) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
