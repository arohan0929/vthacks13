"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store/auth-store';
import {
  LayoutDashboard,
  FolderOpen,
  BarChart3,
  TrendingUp,
  Settings,
  Shield,
  Menu,
  X,
  ChevronDown,
  Building2,
  Users,
  FileText
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  className?: string;
}

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Projects",
    href: "/projects",
    icon: FolderOpen,
    badge: "New",
  },
  {
    title: "Reports",
    href: "/reports",
    icon: BarChart3,
    children: [
      {
        title: "Compliance Reports",
        href: "/reports/compliance",
        icon: Shield,
      },
      {
        title: "Risk Analysis",
        href: "/reports/risk",
        icon: TrendingUp,
      },
      {
        title: "Audit Trail",
        href: "/reports/audit",
        icon: FileText,
      },
    ],
  },
  {
    title: "Analytics",
    href: "/analytics",
    icon: TrendingUp,
  },
  {
    title: "Organization",
    href: "/organization",
    icon: Building2,
    children: [
      {
        title: "Team Members",
        href: "/organization/team",
        icon: Users,
      },
      {
        title: "Settings",
        href: "/organization/settings",
        icon: Settings,
      },
    ],
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
  },
];

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (title: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(title)) {
      newExpanded.delete(title);
    } else {
      newExpanded.add(title);
    }
    setExpandedItems(newExpanded);
  };

  const isActive = (href: string) => {
    return pathname === href || pathname.startsWith(href + '/');
  };

  const NavItemComponent = ({ item, level = 0 }: { item: NavItem; level?: number }) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.has(item.title);
    const itemIsActive = isActive(item.href);

    return (
      <div className="w-full">
        <Link
          href={item.href}
          className={cn(
            "group flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 enterprise-focus",
            level > 0 && "ml-4 pl-8",
            itemIsActive
              ? "bg-enterprise-primary text-enterprise-text-primary shadow-md"
              : "text-enterprise-text-secondary hover:text-enterprise-text-primary hover:bg-enterprise-surface-elevated"
          )}
          onClick={(e) => {
            if (hasChildren) {
              e.preventDefault();
              toggleExpanded(item.title);
            }
          }}
        >
          <div className="flex items-center space-x-3">
            <item.icon className={cn(
              "h-5 w-5 flex-shrink-0 transition-colors",
              itemIsActive
                ? "text-enterprise-text-primary"
                : "text-enterprise-text-tertiary group-hover:text-enterprise-text-primary"
            )} />
            <span className="truncate">{item.title}</span>
            {item.badge && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-enterprise-primary text-enterprise-text-primary">
                {item.badge}
              </span>
            )}
          </div>
          {hasChildren && (
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform duration-200",
              isExpanded && "rotate-180"
            )} />
          )}
        </Link>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1 animate-in slide-in-from-top-2 duration-200">
            {item.children!.map((child) => (
              <NavItemComponent key={child.href} item={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden enterprise-button-secondary p-2"
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        aria-label="Toggle navigation menu"
      >
        {isMobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {/* Overlay for mobile */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "enterprise-sidebar",
        isMobileOpen && "mobile-open",
        className
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center px-6 py-6 border-b border-enterprise-border-primary">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-enterprise-primary rounded-lg flex items-center justify-center">
                <Shield className="h-5 w-5 text-enterprise-text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-enterprise-text-primary">
                  Complai
                </h1>
                <p className="text-xs text-enterprise-text-tertiary">
                  Enterprise Edition
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {navItems.map((item) => (
              <NavItemComponent key={item.href} item={item} />
            ))}
          </nav>

          {/* Footer */}
          <div className="p-4 border-t border-enterprise-border-primary">
            <div className="enterprise-glass rounded-lg p-3">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-full bg-enterprise-primary flex items-center justify-center">
                  <span className="text-sm font-semibold text-enterprise-text-primary">
                    {user?.displayName ? user.displayName.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-enterprise-text-primary truncate">
                    {user?.displayName || 'User'}
                  </p>
                  <p className="text-xs text-enterprise-text-tertiary truncate">
                    {user?.email || 'user@example.com'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}