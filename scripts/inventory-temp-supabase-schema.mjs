const projectRef = "wiesmommcmwwwkwufgqg";
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;

if (!accessToken) {
  throw new Error("SUPABASE_ACCESS_TOKEN is required");
}

const query = `
select
  table_name,
  json_agg(
    json_build_object(
      'name', column_name,
      'type', data_type,
      'nullable', is_nullable
    )
    order by ordinal_position
  ) as columns
from information_schema.columns
where table_schema = 'public'
group by table_name
order by table_name;
`;

const response = await fetch(
  `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  },
);

if (!response.ok) {
  throw new Error(`Management SQL failed: ${response.status}`);
}

const rows = await response.json();
for (const row of rows) {
  console.log(JSON.stringify(row));
}
