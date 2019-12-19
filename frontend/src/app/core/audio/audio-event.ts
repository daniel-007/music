import { merge as lodashMerge } from 'lodash';
import {
  fromEvent, merge, Observable, of, Subject,
} from 'rxjs';
import {
  filter, map, mapTo, take, takeUntil, tap,
} from 'rxjs/operators';

import { AudioEvent, PeakConfig } from './interface';

export class AudioListeners {
  public audio = new Audio();

  public peakConfig: PeakConfig;

  protected release$ = new Subject<number>();

  protected peakStartTime: number;


  constructor(peakConfig: PeakConfig) {
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    this.peakConfig = peakConfig;
  }

  public event(
    eventName: AudioEvent,
  ): Observable<
    | { event: AudioEvent.layoutTouch; data: { endTime: number; currentTime: number } }
    | { event: AudioEvent }
    > {
    switch (eventName) {
      case AudioEvent.play:
        return this.play$();
      case AudioEvent.played:
        return this.played$();
      case AudioEvent.error:
        return this.error$();
      case AudioEvent.ended:
        return this.ended$();
      case AudioEvent.layoutTouch:
        return this.layoutTouch$();
      case AudioEvent.layoutEnded:
        return this.layoutEnded$();
      case AudioEvent.timeupdate:
        return this.timeupdate$();
      default:
        return of({ event: AudioEvent.unknown });
    }
  }

  protected changePeak({
    peakStartTime,
    peakConfig,
  }: { peakStartTime?: number; peakConfig?: PeakConfig } = {}) {
    if (peakStartTime !== undefined) {
      this.peakStartTime = peakStartTime;
    }

    if (peakConfig !== undefined) {
      lodashMerge(this.peakConfig, peakConfig);
    }
  }

  protected destroy() {
    this.release$.next(Date.now());
    this.audio = null;
  }

  private play$() {
    return fromEvent(this.audio, AudioEvent.play).pipe(
      takeUntil(this.release$),
      take(1),
      tap((e) => {
        console.debug('====> Event:play', e);
      }),
      mapTo({ event: AudioEvent.play }),
    );
  }

  private error$() {
    // 监听错误事件
    return fromEvent(this.audio, AudioEvent.error).pipe(
      takeUntil(this.release$),
      take(1),
      tap((e) => {
        console.debug('====> Event:error', e);
      }),
      mapTo({ event: AudioEvent.error }),
    );
  }

  private ended$() {
    // 监听结束事件
    return fromEvent(this.audio, AudioEvent.ended).pipe(
      takeUntil(this.release$),
      take(1),
      tap((e) => {
        console.debug('====> Event:ended', e);
      }),
      mapTo({ event: AudioEvent.ended }),
    );
  }

  private timeupdate$() {
    return fromEvent(this.audio, AudioEvent.timeupdate).pipe(
      takeUntil(
        merge(fromEvent(this.audio, 'ended'), fromEvent(this.audio, 'error'), this.release$),
      ),
      map(() => ({
        event: AudioEvent.timeupdate,
        data: { currentTime: this.audio.currentTime },
      })),
    );
  }

  private layoutTouch$(): Observable<{
    event: AudioEvent.layoutTouch;
    data: { endTime: number; currentTime: number };
  }> {
    const endTime = this.peakStartTime + this.peakConfig.duration + this.peakConfig.after;

    return fromEvent(this.audio, AudioEvent.timeupdate).pipe(
      filter(() => {
        if (endTime && this.audio.currentTime >= endTime - this.peakConfig.layOut) {
          console.debug('layoutTouch 片段结尾');
          return true;
        }
        if (this.audio.currentTime >= this.audio.duration - this.peakConfig.layOut) {
          console.debug('layoutTouch 整首歌结尾');
          // 整首歌结尾
          return true;
        }
        return false;
      }),
      takeUntil(
        merge(fromEvent(this.audio, 'ended'), fromEvent(this.audio, 'error'), this.release$),
      ),
      take(1),
      map(() => ({
        event: AudioEvent.layoutTouch,
        data: { endTime, currentTime: this.audio.currentTime },
      })),
    );
  }

  private layoutEnded$() {
    const endTime = this.peakStartTime + this.peakConfig.duration + this.peakConfig.after;

    return fromEvent(this.audio, AudioEvent.timeupdate).pipe(
      filter(() => {
        if (endTime && this.audio.currentTime >= endTime) {
          return true;
        }
        if (this.audio.currentTime >= this.audio.duration) {
          return true;
        }
        return false;
      }),
      takeUntil(
        merge(
          fromEvent(this.audio, AudioEvent.ended),
          fromEvent(this.audio, AudioEvent.error),
          this.release$,
        ),
      ),
      take(1),
      mapTo({ event: AudioEvent.layoutEnded }),
    );
  }

  private played$() {
    return fromEvent(this.audio, AudioEvent.playing).pipe(
      take(1),
      takeUntil(this.release$),
      mapTo({ event: AudioEvent.played }),
    );
  }
}