import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import {
  BLACKLIST_TYPES,
  type BlacklistEntry,
  type BlacklistType,
} from '../../../database/entities/blacklist-entry.entity';
import { PaginationQueryDto } from '../../../common/pagination';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateBlacklistEntryDto {
  @ApiProperty({ enum: BLACKLIST_TYPES })
  @IsIn(BLACKLIST_TYPES)
  type!: BlacklistType;

  /** Email address or E.164 phone number; normalised before storage. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  value!: string;

  /** Internal reason. Never shown to end users. */
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class BlacklistCheckQueryDto {
  @ApiProperty({ enum: BLACKLIST_TYPES })
  @IsIn(BLACKLIST_TYPES)
  type!: BlacklistType;

  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(320)
  value!: string;
}

export class BlacklistListQueryDto extends PaginationQueryDto {}

export class BlacklistEntryResponseDto {
  id!: string;
  @ApiProperty({ enum: BLACKLIST_TYPES })
  type!: BlacklistType;
  value!: string;
  reason!: string;
  createdBy!: string;
  createdAt!: string;

  static from(entry: BlacklistEntry): BlacklistEntryResponseDto {
    return {
      id: entry.id,
      type: entry.type,
      value: entry.value,
      reason: entry.reason,
      createdBy: entry.createdBy,
      createdAt: entry.createdAt.toISOString(),
    };
  }
}

export class BlacklistCheckResponseDto {
  listed!: boolean;
  entry!: BlacklistEntryResponseDto | null;
}
