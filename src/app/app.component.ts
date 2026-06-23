import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChildren, QueryList } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AsyncPipe } from '@angular/common';
import { TickerService, TickerItem } from './ticker.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, AsyncPipe],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements AfterViewInit, OnDestroy {
  title = 'kapitalcorpLLC';

  isScrolled = false;
  menuOpen = false;

  ticker$: Observable<TickerItem[]>;

  @ViewChildren('reveal') revealEls!: QueryList<ElementRef<HTMLElement>>;

  private observer?: IntersectionObserver;

  constructor(private tickerService: TickerService) {
    this.ticker$ = this.tickerService.ticker$;
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled = window.scrollY > 40;
  }

  ngAfterViewInit(): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.2 }
    );

    this.revealEls.forEach((el) => this.observer?.observe(el.nativeElement));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }
}

