"use client";
import React from 'react';
import { signOut } from 'next-auth/react';

export function LogoutButton() {
  return (
    <button 
      onClick={() => signOut({ callbackUrl: '/login' })} 
      className="btn btn-primary" 
      style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
    >
      Sign out
    </button>
  );
}
