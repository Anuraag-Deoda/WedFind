"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Store password in session for admin API calls
    sessionStorage.setItem("admin_password", password);

    try {
      const res = await fetch("/new-app/api/events", {
        headers: { "X-Admin-Password": password },
      });
      if (res.ok) {
        router.push("/admin/dashboard");
      } else {
        setError("Invalid admin password");
        sessionStorage.removeItem("admin_password");
      }
    } catch {
      setError("Could not connect to server");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-warm-900">Admin Login</h1>
          <p className="text-warm-500 mt-1">Event management dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            id="password"
            type="password"
            label="Password"
            placeholder="Enter admin password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            error={error}
          />
          <Button type="submit" className="w-full" size="lg">
            Login
          </Button>
        </form>
      </div>
    </div>
  );
}
