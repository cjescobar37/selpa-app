/** Local PostgreSQL only. Metadata supplies column types; no network or .env. */
export function typedSchema(tables,{names=null,roles=true}={}) {
  const quote=value=>'"'+String(value).replaceAll('"','""')+'"'
  const literal=value=>"'"+String(value).replaceAll("'","''")+"'"
  const selected=names?tables.filter(t=>names.has(t.name)):tables
  const enums=new Map()
  for(const table of selected)for(const column of table.columns)if(column.enums?.length)enums.set(column.type,column.enums)
  const sql=[]
  if(roles)sql.push('create role anon;create role authenticated;create role service_role bypassrls;')
  for(const [name,values] of enums)sql.push(`create type public.${quote(name)} as enum (${values.map(literal).join(',')});`)
  for(const table of selected){
    const fields=table.columns.map(column=>{
      let type
      if(enums.has(column.type))type='public.'+quote(column.type)
      else if(column.dataType==='ARRAY')type=column.type.slice(1)+'[]'
      else if(column.dataType==='USER-DEFINED')throw Error('Unrepresented type '+column.type)
      else type=column.dataType
      const value=String(column.default??'')
      const fixed=/^(?:true|false|-?\d+(?:\.\d+)?)$/.test(value)?value:/^'[^']*'::[\w .]+$/.test(value)?literal(value.split("'")[1]):null
      return quote(column.name)+' '+type+(fixed?' default '+fixed:'')
    })
    if(table.primary_keys?.length)fields.push('primary key ('+table.primary_keys.map(quote).join(',')+')')
    sql.push('create table public.'+quote(table.name.replace('public.',''))+' ('+fields.join(',')+');')
  }
  return sql.join('\n')
}
