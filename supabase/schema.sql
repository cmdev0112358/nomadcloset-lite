-- users (minimal; optional auth)
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  nickname text,
  -- Corrected: timestamptz
  created_at timestamptz default now()
);

-- places
create table if not exists places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  -- Corrected: timestamptz
  created_at timestamptz default now()
);

-- items
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  category text,
  place_id uuid references places(id) on delete set null,
  -- Corrected: timestamptz
  created_at timestamptz default now()
);

-- action log (for analysis)
create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  session_id text,
  action_type text not null,
  item_id uuid,
  item_name text,
  from_place_id uuid,
  to_place_id uuid,
  metadata jsonb,
  -- Corrected: timestamptz
  created_at timestamptz default now()
);