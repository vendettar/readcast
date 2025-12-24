// src/components/Header/Header.tsx
import logoSvg from '../../assets/readio.svg';

export function Header() {
    return (
        <header className="top-bar">
            <div className="logo-mark panel-surface">
                <img src={logoSvg} alt="" className="logo-icon" />
                <span className="logo-text">Readio</span>
            </div>
        </header>
    );
}
