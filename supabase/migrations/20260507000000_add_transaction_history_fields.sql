alter table public.transactions
  add column if not exists expires_at timestamptz,
  add column if not exists merchant_name text,
  add column if not exists merchant_city text,
  add column if not exists qris_type text,
  add column if not exists network text not null default 'devnet',
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz,
  add column if not exists verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_qris_type_check'
  ) then
    alter table public.transactions
      add constraint transactions_qris_type_check
      check (qris_type is null or qris_type in ('static', 'dynamic')) not valid;
  end if;
end $$;

alter table public.transactions
  validate constraint transactions_qris_type_check;

create index if not exists transactions_user_wallet_created_at_idx
  on public.transactions (user_wallet, created_at desc);

create index if not exists transactions_solana_tx_signature_idx
  on public.transactions (solana_tx_signature)
  where solana_tx_signature is not null;
