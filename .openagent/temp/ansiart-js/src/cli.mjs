#!/usr/bin/env node
import { Command } from 'commander';
import { renderFileToAnsi } from './renderer.mjs';
import fs from 'node:fs';

const program = new Command();
program
  .name('ansiart')
  .description('Convert images to ANSI art for terminals (256-color, half-block mode by default).')
  .argument('[image]', 'Path to input image (PNG)')
  .option('-w, --width <n>', 'Target width in characters', (v)=>parseInt(v,10))
  .option('-m, --mode <mode>', 'Rendering mode: block|pixel', 'block')
  .option('-d, --dither', 'Enable Floyd-Steinberg dithering to xterm-256 palette', false)
  .option('-o, --out <file>', 'Write output to file instead of stdout')
  .action(async (image, opts)=>{
    if (!image){
      program.help();
      return;
    }
    const ansi = await renderFileToAnsi(image, { width: opts.width, dither: !!opts.dither, mode: opts.mode });
    if (opts.out){ await fs.promises.writeFile(opts.out, ansi); } else { process.stdout.write(ansi); }
  });

program.parseAsync(process.argv);
