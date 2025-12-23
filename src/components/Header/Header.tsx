// src/components/Header/Header.tsx
import logoSvg from '../../assets/readcast.svg';

export function Header() {
    return (
        <header className="top-bar">
            <div className="logo-mark panel-surface">
                <img src={logoSvg} alt="" className="logo-icon" />
                <span className="logo-text">Readcast</span>
            </div>
        </header>
    );
}
