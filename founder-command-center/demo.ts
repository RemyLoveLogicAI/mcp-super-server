#!/usr/bin/env bun
/**
 * Founder Daily Triage Loop - Demo
 * 
 * PROOF 4: GOVERNED EXECUTION
 * 
 * Demonstrates end-to-end loop:
 * Signal → Decision → Approval → Action → Receipt → Brief
 */

import {
  FounderTriageLoop,
  type Signal,
  type Event,
  type Action,
  type Approval,
  type Receipt
} from './core';

interface LoopResult {
  signal: Signal;
  event: Event;
  action: Action;
  approval?: Approval;
  receipt: Receipt;
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  FOUNDER DAILY TRIAGE LOOP — GOVERNED EXECUTION');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const triage = new FounderTriageLoop();

  // Test signals with varying priorities
  const signals = [
    {
      raw: 'Urgent: PR #42 needs immediate review - blocking production deploy',
      source: 'github' as const,
      expected: 'critical'
    },
    {
      raw: 'Important email from investor regarding Series A timeline',
      source: 'email' as const,
      expected: 'high'
    },
    {
      raw: 'New doc shared: Q2 roadmap draft ready for review',
      source: 'drive' as const,
      expected: 'medium'
    },
    {
      raw: 'Weekly sync notes uploaded to drive',
      source: 'drive' as const,
      expected: 'low'
    }
  ];

  const results: LoopResult[] = [];

  for (const sig of signals) {
    console.log(`\n▶ Processing signal: "${sig.raw.substring(0, 50)}..."`);
    console.log(`  Source: ${sig.source}`);
    
    const result = await triage.run(sig.raw, sig.source);
    results.push(result as LoopResult);
    
    console.log(`  ✓ Signal ID: ${result.signal.id}`);
    console.log(`  ✓ Event ID: ${result.event.id}`);
    console.log(`  ✓ Priority: ${result.signal.classified?.priority}`);
    console.log(`  ✓ Action: ${result.action.id} → ${result.action.status}`);
    
    if (result.approval) {
      console.log(`  ✓ Approval: ${result.approval.id} → ${result.approval.status}`);
    }
    
    console.log(`  ✓ Receipt: ${result.receipt.id} → ${result.receipt.status}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  ARTIFACTS GENERATED');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Read generated artifacts
  const fs = await import('fs');
  const path = await import('path');
  
  const baseDir = '/home/workspace/founder-command-center';
  
  const artifacts = [
    { name: 'events.jsonl', desc: 'Event Ledger' },
    { name: 'actions.jsonl', desc: 'Action Log' },
    { name: 'approvals.jsonl', desc: 'Approval Log' },
    { name: 'receipts.jsonl', desc: 'Receipt Ledger' }
  ];

  for (const artifact of artifacts) {
    const filePath = path.join(baseDir, artifact.name.replace('.jsonl', ''), artifact.name);
    if (fs.existsSync(filePath)) {
      const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      console.log(`  ${artifact.desc}: ${lines.length} entries`);
      console.log(`    Path: ${filePath}`);
    }
  }

  // Check for daily brief
  const today = new Date().toISOString().split('T')[0];
  const briefPath = path.join(baseDir, `daily_brief_${today}.md`);
  if (fs.existsSync(briefPath)) {
    console.log(`\n  Daily Brief Generated:`);
    console.log(`    Path: ${briefPath}`);
    const briefContent = fs.readFileSync(briefPath, 'utf-8');
    const brief = JSON.parse(briefContent);
    console.log('\n' + brief.markdown);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  PROOF 4: GOVERNED EXECUTION — COMPLETE');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  console.log('Summary:');
  console.log(`  • ${results.length} signals processed`);
  console.log(`  • ${results.filter(r => r.approval).length} approvals requested`);
  console.log(`  • ${results.filter(r => r.action.status === 'succeeded').length} actions succeeded`);
  console.log(`  • ${results.filter(r => r.action.status === 'blocked').length} actions blocked`);
  console.log(`  • ${results.length} receipts written`);
  console.log('\n  Loop: Signal → Decision → Approval → Action → Receipt → Brief');
  console.log('  Status: CLOSED\n');
}

main().catch(console.error);