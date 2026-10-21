import { describe, expect, it } from 'vitest';

import {
  parseSkillPrefixFromContent,
  resolveUserMessageDisplay,
  stripSkillPrefixFromContent,
} from './user-message-skills';

describe('user-message-skills', () => {
  it('parses one or more leading skill tokens from content', () => {
    expect(parseSkillPrefixFromContent('/research-summary 分析一下股市')).toEqual({
      skillNames: ['research-summary'],
      body: '分析一下股市',
    });
    expect(
      parseSkillPrefixFromContent('/concise-chinese /research-summary 任务正文'),
    ).toEqual({
      skillNames: ['concise-chinese', 'research-summary'],
      body: '任务正文',
    });
  });

  it('stops parsing when token is not a skill slug', () => {
    expect(parseSkillPrefixFromContent('/-bad 正文')).toEqual({
      skillNames: [],
      body: '/-bad 正文',
    });
  });

  it('prefers metadata skillNames and strips matching prefix', () => {
    expect(
      resolveUserMessageDisplay({
        content: '/research-summary 分析一下股市',
        skillNames: ['research-summary'],
      }),
    ).toEqual({
      skillNames: ['research-summary'],
      body: '分析一下股市',
    });
  });

  it('stripSkillPrefixFromContent handles partial prefix mismatch', () => {
    expect(stripSkillPrefixFromContent('纯正文', ['research-summary'])).toBe('纯正文');
  });
});
