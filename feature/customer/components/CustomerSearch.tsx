"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { searchCustomers } from "../services/getCustomers";
import type { CustomerSummary } from "../types";

interface CustomerSearchProps {
  shopId: number;
  onSelect?: (customer: CustomerSummary) => void;
  mode: "page" | "inline";
}

export function CustomerSearch({ shopId, onSelect, mode }: CustomerSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setIsOpen(false);
        return;
      }
      setIsLoading(true);
      try {
        const data = await searchCustomers(shopId, searchQuery, 10);
        setResults(data);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [shopId]
  );

  function handleChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  function handleSelect(customer: CustomerSummary) {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    if (mode === "page") {
      router.push(`/customer/${customer.id}`);
    } else if (onSelect) {
      onSelect(customer);
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="名前・電話番号・コードで検索..."
          className="pl-9"
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-white shadow-lg">
          {isLoading ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              検索中...
            </div>
          ) : results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              該当する顧客が見つかりません
            </div>
          ) : (
            <ul className="max-h-60 overflow-auto py-1">
              {results.map((customer) => {
                const fullName = [customer.last_name, customer.first_name]
                  .filter(Boolean)
                  .join(" ") || "-";

                return (
                  <li key={customer.id}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-2 text-left text-sm hover:bg-gray-100"
                      onClick={() => handleSelect(customer)}
                    >
                      <span className="font-mono text-xs text-muted-foreground">
                        {customer.code}
                      </span>
                      <span className="font-medium">{fullName}</span>
                      {customer.phone_number_1 && (
                        <span className="text-xs text-muted-foreground">
                          {customer.phone_number_1}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
