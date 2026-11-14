/**
 * TypeScript implementation of the Agent Skills format (https://agentskills.io).
 *
 * Layers, from the file format up:
 *   parser, validator   read and check one SKILL.md
 *   discovery           find skills in project, user and bundled scopes
 *   catalog             disclose name and description to the model
 *   activation          load a skill's instructions into the conversation
 *   delegation          run a skill in an isolated subagent session
 *   installer           ship and install the bundled skill pack
 */
export * from './models.js';
export * from './parser.js';
export * from './validator.js';
export * from './discovery.js';
export * from './catalog.js';
export * from './activation.js';
export * from './delegation.js';
export * from './installer.js';
