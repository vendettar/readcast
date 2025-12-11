const actionTimers = new WeakMap();

function closeAction(actionElement) {
    if (!actionElement) return;
    const trigger = actionElement.querySelector('.action-button');
    actionElement.classList.remove('open');
    if (trigger) trigger.setAttribute('aria-expanded', 'false');
    const timer = actionTimers.get(actionElement);
    if (timer) {
        clearTimeout(timer);
        actionTimers.delete(actionElement);
    }
}

function attachActionHandlers(actionElement, allActions) {
    if (!actionElement) return;
    const trigger = actionElement.querySelector('.action-button');
    if (!trigger) return;

    const setExpanded = (state) => trigger.setAttribute('aria-expanded', state ? 'true' : 'false');

    const clearPendingClose = () => {
        const timer = actionTimers.get(actionElement);
        if (timer) {
            clearTimeout(timer);
            actionTimers.delete(actionElement);
        }
    };

    const openActionMenu = () => {
        clearPendingClose();
        allActions.forEach((action) => {
            if (action && action !== actionElement) closeAction(action);
        });
        actionElement.classList.add('open');
        setExpanded(true);
    };

    const scheduleClose = () => {
        clearPendingClose();
        const timer = setTimeout(() => {
            closeAction(actionElement);
        }, 160);
        actionTimers.set(actionElement, timer);
    };

    actionElement.addEventListener('mouseenter', openActionMenu);
    actionElement.addEventListener('mouseleave', scheduleClose);
    actionElement.addEventListener('focusin', openActionMenu);
    actionElement.addEventListener('focusout', (event) => {
        if (!actionElement.contains(event.relatedTarget)) {
            scheduleClose();
        }
    });

    trigger.addEventListener('click', (event) => {
        event.preventDefault();
        if (actionElement.classList.contains('open')) {
            scheduleClose();
        } else {
            openActionMenu();
        }
    });
}

export function setupActionMenus(actionControls) {
    actionControls.forEach((action) => attachActionHandlers(action, actionControls));
    document.addEventListener('click', (event) => {
        actionControls.forEach((action) => {
            if (action && !action.contains(event.target)) {
                closeAction(action);
            }
        });
    });
}
