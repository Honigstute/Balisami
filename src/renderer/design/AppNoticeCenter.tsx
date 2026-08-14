import { useSyncExternalStore } from 'react';

import { Icon } from '../shell/Icon';
import type { NoticeCenterStore } from './notice-center';

export const AppNoticeCenter = ({ store }: { readonly store: NoticeCenterStore }) => {
  const notices = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return (
    <section aria-label="Notifications" aria-live="polite" className="app-notice-center">
      {notices.map((notice) => (
        <article className={`app-notice app-notice--${notice.tone}`} key={notice.key} role="status">
          <div className="app-notice__copy">
            <strong>{notice.title}</strong>
            <p>{notice.message}</p>
          </div>
          <button
            aria-label={`Dismiss ${notice.title}`}
            className="icon-button app-notice__dismiss"
            onClick={() => store.dismiss(notice.key)}
          >
            <Icon name="close" />
          </button>
        </article>
      ))}
    </section>
  );
};
