import { useEffect, useState, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { School, Menu, Search, Bell, HelpCircle, LogOut, User, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

export default function Header() {
  const [location, navigate] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [showSearch, setShowSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Handle logout
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Handle search toggle for mobile
  const toggleSearch = () => {
    setShowSearch(prev => !prev);
  };

  // Focus search input when shown
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [showSearch]);

  // Get user's initials for avatar
  const getUserInitials = () => {
    if (!user?.fullName) return 'U';
    
    const names = user.fullName.split(' ');
    if (names.length === 1) return names[0].charAt(0).toUpperCase();
    
    return (names[0].charAt(0) + names[names.length - 1].charAt(0)).toUpperCase();
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
      <div className="flex items-center justify-between h-16 px-4">
        <div className="flex items-center">
          <button id="sidebar-toggle" className="p-2 rounded-full hover:bg-gray-100 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center ml-2">
            <School className="text-primary mr-2 h-6 w-6" />
            <h1 className="font-medium text-xl">EduGenius</h1>
          </Link>
        </div>
        
        <div className={`${showSearch ? 'flex absolute left-0 right-0 top-0 p-3 bg-white z-20 h-16 items-center' : 'hidden md:flex'} items-center`}>
          {showSearch && (
            <button className="p-2 mr-2" onClick={toggleSearch}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.707 14.707a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l2.293 2.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
            </button>
          )}
          <div className="relative flex-grow max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search"
              className="pl-10 h-9 w-full bg-gray-100 focus:bg-white"
            />
          </div>
          {showSearch && (
            <Button variant="ghost" size="sm" className="ml-2">
              Search
            </Button>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <button className="p-2 rounded-full hover:bg-gray-100 md:hidden" onClick={toggleSearch}>
            <Search className="h-5 w-5" />
          </button>
          
          <button className="p-2 rounded-full hover:bg-gray-100">
            <Bell className="h-5 w-5" />
          </button>
          
          <button className="p-2 rounded-full hover:bg-gray-100">
            <HelpCircle className="h-5 w-5" />
          </button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative focus:outline-none">
                <Avatar className="h-9 w-9 border border-gray-200 cursor-pointer">
                  <AvatarFallback className="bg-primary text-white">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.fullName}</p>
                  <p className="text-xs text-gray-500">{user?.username}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="mr-2 h-4 w-4" />
                  <span>Settings</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} disabled={logoutMutation.isPending}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>{logoutMutation.isPending ? 'Logging out...' : 'Log out'}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
