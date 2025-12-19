export function lockBodyScroll({ bodyClass } = {}) {
  const body = document.body;
  if (!body) return null;

  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  const previousStyles = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    paddingRight: body.style.paddingRight,
  };

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }

  body.style.position = 'fixed';
  body.style.top = `-${scrollY}px`;
  body.style.left = `-${scrollX}px`;
  body.style.right = '0';
  body.style.width = '100%';

  if (bodyClass) body.classList.add(bodyClass);

  return { scrollX, scrollY, previousStyles, bodyClass: bodyClass || '' };
}

export function unlockBodyScroll(lock) {
  const body = document.body;
  if (!body) return;
  if (!lock) return;

  const { scrollX, scrollY, previousStyles, bodyClass } = lock;
  body.style.position = previousStyles.position;
  body.style.top = previousStyles.top;
  body.style.left = previousStyles.left;
  body.style.right = previousStyles.right;
  body.style.width = previousStyles.width;
  body.style.paddingRight = previousStyles.paddingRight;

  if (bodyClass) body.classList.remove(bodyClass);
  window.scrollTo(scrollX, scrollY);
}

