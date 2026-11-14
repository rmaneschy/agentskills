// Stand-in for an agent CLI, used by the delegation tests. Reads a brief, prints a reply.
import fs from 'node:fs';

const args = process.argv.slice(2);
let brief;
if (args.includes('--from-file')) brief = fs.readFileSync(args[args.indexOf('--from-file') + 1], 'utf8');
else if (args.includes('--from-arg')) brief = args[args.indexOf('--from-arg') + 1];
else brief = fs.readFileSync(0, 'utf8');

if (args.includes('--fail')) {
  console.log('partial work');
  console.error('boom');
  process.exit(7);
}
console.log('noise line '.repeat(50));
if (!args.includes('--no-summary')) {
  console.log(
    `<summary>brief had ${brief.length} chars; task seen: ${brief.includes('## Task')}; ação concluída</summary>`,
  );
}
