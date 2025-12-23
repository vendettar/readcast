// src/components/FABDock/FABDock.tsx
import { ShortcutsFAB } from './ShortcutsFAB';
import { QAFAB } from './QAFAB';
import { SettingsFAB } from './SettingsFAB';

export function FABDock() {
    return (
        <div className="fab-dock">
            <ShortcutsFAB />
            <QAFAB />
            <SettingsFAB />
        </div>
    );
}
