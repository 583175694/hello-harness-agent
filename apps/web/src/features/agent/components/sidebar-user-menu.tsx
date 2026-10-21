import { LogOut, Settings, UserRound } from 'lucide-react';

import type { AuthUserView } from '@harness/agent-protocol';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { authAccountShortLabel } from '../../auth/mask-target';

function userAvatarLabel(user: AuthUserView): string {
  const label = authAccountShortLabel(user);
  const ch = label.trim()[0];
  return ch && /[a-zA-Z0-9\u4e00-\u9fff]/.test(ch) ? ch.toUpperCase() : 'U';
}

type SidebarUserMenuProps = {
  authUser?: AuthUserView | null;
  onRequestLogin?: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
};

export function SidebarUserMenu({
  authUser,
  onRequestLogin,
  onOpenSettings,
  onLogout,
}: SidebarUserMenuProps) {
  if (!onRequestLogin && !onOpenSettings) return null;

  if (!authUser) {
    if (onRequestLogin) {
      return (
        <div className="sidebar-settings-row">
          <button
            type="button"
            className="sidebar-settings-btn"
            aria-label="登录"
            onClick={onRequestLogin}
          >
            <UserRound className="sidebar-settings-btn__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
            <span className="sidebar-settings-btn__label">登录</span>
          </button>
        </div>
      );
    }
    if (!onOpenSettings) return null;
    return (
      <div className="sidebar-settings-row">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className="sidebar-settings-btn" aria-label="菜单">
              <Settings className="sidebar-settings-btn__icon" size={18} strokeWidth={1.5} aria-hidden="true" />
              <span className="sidebar-settings-btn__label">设置</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="sidebar-user-menu" side="top" align="start" sideOffset={10}>
            <DropdownMenuItem className="sidebar-user-menu__item" onSelect={() => onOpenSettings()}>
              <Settings size={18} strokeWidth={1.5} aria-hidden="true" />
              <span className="sidebar-user-menu__label">设置</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="sidebar-settings-row">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="sidebar-settings-btn sidebar-user-trigger"
            aria-label="账号菜单"
            aria-haspopup="menu"
          >
            <span className="sidebar-user-trigger__avatar" aria-hidden="true">
              {userAvatarLabel(authUser)}
            </span>
            <span className="sidebar-settings-btn__label sidebar-settings-btn__label--truncate">
              {authUser.displayName || authAccountShortLabel(authUser)}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="sidebar-user-menu"
          side="top"
          align="start"
          sideOffset={10}
        >
          {onOpenSettings ? (
            <DropdownMenuItem
              className="sidebar-user-menu__item"
              onSelect={() => onOpenSettings()}
            >
              <Settings size={18} strokeWidth={1.5} aria-hidden="true" />
              <span className="sidebar-user-menu__label">设置</span>
            </DropdownMenuItem>
          ) : null}
          {onLogout ? (
            <DropdownMenuItem
              className="sidebar-user-menu__item sidebar-user-menu__item--danger"
              onSelect={() => onLogout()}
            >
              <LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
              <span className="sidebar-user-menu__label">退出登录</span>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
