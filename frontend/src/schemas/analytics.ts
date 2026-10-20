/**
 * 埋点与分析层校验 —— 镜像 docs/cloudbase-contract.md v1.4 §8。
 * analytics_events / profiles 均为非敏感表，前端直接经 cloud.rdb() 读写（受 RLS）。
 */
import { z } from 'zod'
import {
  ANALYTICS_NAMES,
  CHANNELS,
  DOMAINS,
  FUNNEL_STEPS,
  USER_TYPES,
} from '../types/contract'

/** 契约 §8：analytics_events 写入形状（id/ts 由 DB 生成） */
export const analyticsEventSchema = z.object({
  name: z.enum(ANALYTICS_NAMES),
  step: z.enum(FUNNEL_STEPS).nullish(),
  domain: z.enum(DOMAINS).nullish(),
  channel: z.enum(CHANNELS).nullish(),
  region: z.string().max(64).nullish(),
  user_type: z.enum(USER_TYPES).nullish(),
  variant: z.string().max(64).nullish(),
  payload: z.record(z.string(), z.unknown()).default({}),
})

export type AnalyticsEventDraft = z.input<typeof analyticsEventSchema>

/** 契约 §8：profiles 写入形状（user_id 为 PK，由调用方补充） */
export const profileSchema = z.object({
  region: z.string().max(64).nullish(),
  user_type: z.enum(USER_TYPES).default('new'),
  acquire_channel: z.enum(CHANNELS).nullish(),
  gender: z.string().max(16).nullish(),
})

export type ProfileDraft = z.input<typeof profileSchema>