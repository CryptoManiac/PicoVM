/**
 * Very, very, very simple testing program. Conditional jumps, etc. aren't supported yet.
 */

using System;
using System.Collections.Generic;
using System.Text;

namespace SimpleApp
{
    class Test
    {
        static int Plus1(int i, int j, int k, int l) {
            i = i + 1;
            Console.WriteLine(i);

            Console.WriteLine(j);
            Console.WriteLine(k);
            Console.WriteLine(l);


            return i;
        }

        static void Main(string[] args)
        {
            // Plus1(22, 1, 2, 3);
            long a = Plus1(22, 1, 2, 3);
            //long a = 0;

            for(int i = 0; i <= 10; ++i) {
                Console.WriteLine(i);
            }
            
            for(int i = 10; i >= 0; --i) {
                Console.WriteLine(i);
            }
            
            for(int i = 0; i < 10; ++i) {
                Console.WriteLine(i);
            }

            for(int i = 10; i > 0; --i) {
                Console.WriteLine(i);
            }
            Console.WriteLine(a);
        }
    }
}
